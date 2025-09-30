import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PactLogo from "@/assets/logo.png"; 

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Initialize empty local storage for mock data
    if (!localStorage.getItem("mock_mmp_files")) {
      localStorage.setItem("mock_mmp_files", JSON.stringify([]));
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-900 px-4 py-12 md:py-16">
      
      {/* Logo */}
      <div className="flex justify-center mb-8">
        <img
          src={PactLogo}
          alt="PACT Logo"
          className="h-24 w-24 "
        />
      </div>

      {/* Main Heading */}
      <h1 className="text-4xl md:text-5xl font-extrabold mb-6 text-blue-600 text-center">
        PACT Workflow Platform
      </h1>

      {/* Subheading */}
      <p className="text-gray-700 dark:text-gray-300 text-base md:text-lg mb-10 text-center max-w-lg">
        Streamlined MMP Management System for seamless field operations
      </p>

      {/* Feature Badges */}
      <div className="flex flex-wrap justify-center gap-3 mb-10">
        <button
          className="px-4 py-2 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 
                    rounded-full text-sm font-medium shadow-sm transition-all duration-300
                    hover:bg-blue-200 dark:hover:bg-blue-700 hover:scale-105 focus:ring-2 focus:ring-blue-400"
        >
          Project Management
        </button>

        <button
          className="px-4 py-2 bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200 
                    rounded-full text-sm font-medium shadow-sm transition-all duration-300
                    hover:bg-orange-200 dark:hover:bg-orange-700 hover:scale-105 focus:ring-2 focus:ring-orange-400"
        >
          Field Operations
        </button>

        <button
          className="px-4 py-2 bg-black/10 dark:bg-white/10 text-black dark:text-white 
                    rounded-full text-sm font-medium shadow-sm transition-all duration-300
                    hover:bg-black/20 dark:hover:bg-white/20 hover:scale-105 focus:ring-2 focus:ring-gray-400"
        >
          Advanced Reporting
        </button>
      </div>

      {/* Continue Button */}
      <Button
        className="mb-6 px-8 py-3 font-medium bg-blue-600 hover:bg-orange-500 text-white transition-all duration-300 rounded-lg shadow-lg"
        onClick={() => navigate("/auth")}
      >
        Continue to Login
      </Button>

      {/* Footer */}
      <footer className="mt-10 text-gray-500 text-xs md:text-sm text-center">
        &copy; {new Date().getFullYear()} PACT Consultancy. All rights reserved.
      </footer>
    </div>
  );
};

export default Index;
