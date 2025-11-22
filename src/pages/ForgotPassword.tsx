
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/context/AppContext";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

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

  // If user is already logged in, redirect to dashboard
  if (currentUser) {
    navigate("/dashboard");
    return null;
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    
    try {
      // Here would be the actual password reset request to your backend
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      setEmailSent(true);
      toast({
        title: "Reset email sent",
        description: "If an account exists with this email, you'll receive password reset instructions.",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "There was a problem sending reset instructions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
              Enter your email to receive reset instructions
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
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending Email...
                      </>
                    ) : (
                      "Send Reset Instructions"
                    )}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full flex items-center justify-center"
                    onClick={() => navigate("/login")}
                    type="button"
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
                  <p className="text-green-800 mb-2 font-medium">We've sent reset instructions to:</p>
                  <p className="font-semibold text-lg text-green-700">{form.getValues("email")}</p>
                </div>
                <p className="text-sm text-gray-600 text-center">
                  Please check your email and follow the instructions to reset your password.
                  The link will expire in 30 minutes.
                </p>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button 
                  variant="ghost" 
                  className="w-full flex items-center justify-center"
                  onClick={() => navigate("/login")}
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
