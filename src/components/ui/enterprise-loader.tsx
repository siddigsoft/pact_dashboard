import React from 'react';
import { Badge } from '@/components/ui/badge';
import PactLogo from '@/assets/logo.png';
import { Loader2 } from 'lucide-react';

type LoaderMode = 'fullscreen' | 'section' | 'inline';
type LoaderSize = 'sm' | 'md' | 'lg';

interface EnterpriseLoaderProps {
  mode?: LoaderMode;
  size?: LoaderSize;
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  showSystemStatus?: boolean;
  className?: string;
}

export const EnterpriseLoader: React.FC<EnterpriseLoaderProps> = ({
  mode = 'fullscreen',
  size = 'md',
  title = 'Loading',
  subtitle,
  showLogo = true,
  showSystemStatus = true,
  className = ''
}) => {
  const sizeConfig = {
    sm: {
      logo: 'h-8 w-8',
      spinner: 'h-6 w-6',
      blob: 'w-32 h-32',
      title: 'text-sm',
      subtitle: 'text-xs'
    },
    md: {
      logo: 'h-12 w-12',
      spinner: 'h-8 w-8',
      blob: 'w-64 h-64',
      title: 'text-lg',
      subtitle: 'text-sm'
    },
    lg: {
      logo: 'h-16 w-16',
      spinner: 'h-12 w-12',
      blob: 'w-96 h-96',
      title: 'text-2xl',
      subtitle: 'text-base'
    }
  };

  const config = sizeConfig[size];

  if (mode === 'inline') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className={`${config.spinner} animate-spin text-primary`} />
        <span className={`text-muted-foreground ${config.title}`}>{title}</span>
      </div>
    );
  }

  if (mode === 'section') {
    return (
      <div className={`relative overflow-hidden rounded-lg border bg-background p-8 ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-orange-500/5 to-purple-500/5 dark:from-blue-600/10 dark:via-orange-600/10 dark:to-purple-600/10" />
        <div className="absolute inset-0">
          <div className={`absolute top-0 left-1/4 ${config.blob} bg-blue-500/10 dark:bg-blue-600/10 rounded-full blur-3xl animate-blob`} />
          <div className={`absolute top-1/3 right-1/4 ${config.blob} bg-orange-500/10 dark:bg-orange-600/10 rounded-full blur-3xl animate-blob animation-delay-2000`} />
          <div className={`absolute bottom-0 left-1/2 ${config.blob} bg-purple-500/10 dark:bg-purple-600/10 rounded-full blur-3xl animate-blob animation-delay-4000`} />
        </div>
        
        <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-4">
          {showLogo && (
            <img 
              src={PactLogo} 
              alt="PACT Logo" 
              className={config.logo}
            />
          )}
          
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className={`${config.spinner} animate-spin text-primary`} />
              <h3 className={`font-semibold ${config.title}`}>{title}</h3>
            </div>
            
            {subtitle && (
              <p className={`text-muted-foreground ${config.subtitle}`}>
                {subtitle}
              </p>
            )}
          </div>
          
          {showSystemStatus && (
            <Badge variant="secondary" className="gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              System Operational
            </Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4 ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-orange-500/5 to-purple-500/5 dark:from-blue-600/10 dark:via-orange-600/10 dark:to-purple-600/10" />
      <div className="absolute inset-0">
        <div className={`absolute top-0 left-1/4 ${config.blob} bg-blue-500/20 dark:bg-blue-600/20 rounded-full blur-3xl animate-blob`} />
        <div className={`absolute top-1/3 right-1/4 ${config.blob} bg-orange-500/20 dark:bg-orange-600/20 rounded-full blur-3xl animate-blob animation-delay-2000`} />
        <div className={`absolute bottom-0 left-1/2 ${config.blob} bg-purple-500/20 dark:bg-purple-600/20 rounded-full blur-3xl animate-blob animation-delay-4000`} />
      </div>
      
      <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-6">
        {showLogo && (
          <img 
            src={PactLogo} 
            alt="PACT Logo" 
            className={config.logo}
          />
        )}
        
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className={`${config.spinner} animate-spin text-primary`} />
            <h2 className={`font-bold ${config.title}`}>{title}</h2>
          </div>
          
          {subtitle && (
            <p className={`text-muted-foreground ${config.subtitle} max-w-md`}>
              {subtitle}
            </p>
          )}
        </div>
        
        {showSystemStatus && (
          <Badge variant="secondary" className="gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            System Operational
          </Badge>
        )}
      </div>
    </div>
  );
};

export const LoadingCard: React.FC<{ title?: string }> = ({ title = 'Loading...' }) => {
  return (
    <div className="h-[300px] rounded-lg border bg-card flex items-center justify-center">
      <EnterpriseLoader mode="inline" size="sm" title={title} showLogo={false} showSystemStatus={false} />
    </div>
  );
};
