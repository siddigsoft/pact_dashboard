import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Shield, CheckCircle } from 'lucide-react';

export default function AdminSetup() {
  const [email, setEmail] = useState('admin@pact.local');
  const [password, setPassword] = useState('Siddig@2025');
  const [name, setName] = useState('Admin');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  const createAdmin = async () => {
    setLoading(true);
    try {
      // Step 1: Create the auth user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            username: name,
            full_name: 'System Administrator',
            role: 'admin',
          }
        }
      });

      if (signUpError) {
        if (signUpError.message.includes('rate limit')) {
          toast({
            title: 'Rate Limit Exceeded',
            description: 'Please wait a few minutes and try again, or disable email confirmation in your Supabase dashboard.',
            variant: 'destructive',
          });
        } else if (signUpError.message.includes('already registered')) {
          toast({
            title: 'User Already Exists',
            description: 'An account with this email already exists.',
            variant: 'destructive',
          });
        } else {
          throw signUpError;
        }
        setLoading(false);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        throw new Error('No user ID returned from signup');
      }

      // Step 2: Update profile to approved status with admin role
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          status: 'approved',
          role: 'admin',
          username: name,
          full_name: 'System Administrator',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Profile update error:', updateError);
        toast({
          title: 'Profile Update Failed',
          description: 'User created but profile update failed. You may need to approve manually.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Step 3: Add admin role to user_roles table
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'admin',
          created_at: new Date().toISOString()
        });

      if (roleError) {
        console.warn('Role assignment warning:', roleError);
      }

      setSuccess(true);
      toast({
        title: 'Admin Created Successfully!',
        description: `You can now login with email: ${email}`,
      });

    } catch (error: any) {
      console.error('Error creating admin:', error);
      toast({
        title: 'Creation Failed',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Admin Created Successfully!</CardTitle>
            <CardDescription className="text-base">
              Your administrator account has been created and approved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-accent/20 p-4 rounded-md space-y-2">
              <div>
                <span className="font-semibold">Email:</span> {email}
              </div>
              <div>
                <span className="font-semibold">Password:</span> {password}
              </div>
            </div>
            <Button 
              className="w-full" 
              onClick={() => window.location.href = '/login'}
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Shield className="h-16 w-16 text-primary" />
          </div>
          <CardTitle className="text-2xl">Create Admin Account</CardTitle>
          <CardDescription>
            Set up the system administrator account with full permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); createAdmin(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-admin-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-admin-password"
              />
              <p className="text-xs text-muted-foreground">
                Default: Siddig@2025
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Admin Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="input-admin-name"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
              data-testid="button-create-admin"
            >
              {loading ? 'Creating...' : 'Create Admin Account'}
            </Button>

            <div className="bg-accent/20 p-3 rounded-md text-sm space-y-1">
              <p className="font-semibold">Note:</p>
              <p className="text-muted-foreground">
                If you get a rate limit error, please wait a few minutes or disable email confirmation in your Supabase dashboard under Authentication → Providers → Email.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
