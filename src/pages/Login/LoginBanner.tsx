
import React from 'react';
import { LucideShieldCheck, CheckCircle } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

const LoginBanner = ({ isMobile = false }) => {
  return isMobile ? (
    <div className="bg-[#9b87f5]/10 p-3 rounded-lg mb-4">
      <h3 className="text-sm font-medium text-gray-800 text-center">Our PACT Consultancy Platform</h3>
      <p className="text-xs text-gray-600 text-center">Streamlined MMP Management & Field Operations</p>
      
      <div className="flex justify-center gap-1 mt-2">
        <Badge variant="secondary" className="text-[10px] py-0 px-2">Project Planning</Badge>
        <Badge variant="default" className="text-[10px] py-0 px-2">Field Operations</Badge>
        <Badge variant="secondary" className="text-[10px] py-0 px-2">Reporting</Badge>
      </div>
    </div>
  ) : (
  <div className="md:w-1/2 hidden md:block p-8 bg-indigo-100 rounded-l-lg">
      <div className="space-y-8">
        <div className="flex flex-col items-center mb-8">
          <div className="h-20 w-20 rounded-full bg-[#9b87f5]/50 flex items-center justify-center mb-4 shadow-lg transform hover:scale-105 transition-all duration-300">
            <LucideShieldCheck className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 text-center">Our PACT Consultancy Platform</h2>
          <p className="text-gray-600 text-center mt-2">Fully Integrated MMP Management System</p>
        </div>
        
        <div className="space-y-6">
          <h3 className="font-semibold text-gray-800 flex items-center text-lg">
            <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
            Platform Features
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Badge variant="secondary" className="justify-center py-2 text-sm">Project Management</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm">MMP File Uploads</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm">Field Operations</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm">Advanced Reporting</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm">Team Management</Badge>
            <Badge variant="secondary" className="justify-center py-2 text-sm">Secure Communications</Badge>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginBanner;
