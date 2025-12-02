import { AlertTriangle, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ConfigurationErrorProps {
  title?: string;
  description?: string;
  details?: string;
}

export function ConfigurationError({
  title = "Configuration Required",
  description = "The application is not properly configured.",
  details = "Please contact your administrator to resolve this issue."
}: ConfigurationErrorProps) {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted p-4">
            <div className="flex items-start gap-3">
              <Settings className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">What happened?</p>
                <p>{details}</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50 p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>For developers:</strong> Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY 
              environment variables are set during the build process.
            </p>
          </div>

          <Button 
            onClick={handleRefresh} 
            className="w-full gap-2"
            data-testid="button-retry-config"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
