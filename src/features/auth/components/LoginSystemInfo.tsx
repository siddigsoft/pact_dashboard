
import React from 'react';
import { Shield, Server, Database, Info } from 'lucide-react';

const LoginSystemInfo = () => {
  return (
    <div className="mt-4 bg-muted/20 p-4 rounded-lg animate-fade-in">
      <div className="flex items-center space-x-3 mb-3">
        <Shield className="h-5 w-5 text-primary" />
        <h4 className="text-sm font-semibold">Secure Access</h4>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <Server className="h-4 w-4 opacity-70" />
          <p>Encrypted authentication process</p>
        </div>
        <div className="flex items-center space-x-2">
          <Database className="h-4 w-4 opacity-70" />
          <p>Secure data management</p>
        </div>
        <div className="flex items-center space-x-2">
          <Info className="h-4 w-4 opacity-70" />
          <p>Multi-factor authentication available</p>
        </div>
      </div>
    </div>
  );
};

export default LoginSystemInfo;
