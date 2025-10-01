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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50/20 via-orange-50/20 to-gray-100 dark:from-black dark:via-gray-900 dark:to-gray-800 px-4 py-12 md:py-16">
      {/* Card Container */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-10 flex flex-col items-center text-center">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img
            src={PactLogo}
            alt="PACT Logo"
            className="h-24 w-24 animate-bounce shadow-lg rounded-full bg-white p-2"
          />
        </div>

        {/* Main Heading */}
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4 text-blue-600">
          PACT Workflow Platform
        </h1>

        {/* Subheading */}
        <p className="text-gray-700 dark:text-gray-300 text-base md:text-lg mb-8">
          Streamlined MMP Management System for seamless field operations
        </p>

        {/* Feature Badges */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <button
            className="px-4 py-2 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 
                      rounded-full text-sm font-medium shadow-md transition-all duration-300
                      hover:bg-blue-200 dark:hover:bg-blue-700 hover:scale-105 focus:ring-2 focus:ring-blue-400
                      active:translate-y-1 active:shadow-sm"
          >
            Project Management
          </button>

          <button
            className="px-4 py-2 bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200 
                      rounded-full text-sm font-medium shadow-md transition-all duration-300
                      hover:bg-orange-200 dark:hover:bg-orange-700 hover:scale-105 focus:ring-2 focus:ring-orange-400
                      active:translate-y-1 active:shadow-sm"
          >
            Field Operations
          </button>

          <button
            className="px-4 py-2 bg-black/10 dark:bg-white/10 text-black dark:text-white 
                      rounded-full text-sm font-medium shadow-md transition-all duration-300
                      hover:bg-black/20 dark:hover:bg-white/20 hover:scale-105 focus:ring-2 focus:ring-gray-400
                      active:translate-y-1 active:shadow-sm"
          >
            Advanced Reporting
          </button>
        </div>

        {/* Continue Button */}
        <Button
          className="
            mb-4 px-8 py-3 font-semibold rounded-lg text-white
            bg-blue-600 shadow-[0_4px_6px_rgba(0,0,0,0.3)] 
            hover:scale-105 hover:shadow-[0_8px_12px_rgba(0,0,0,0.35)] 
            hover:bg-blue-500
            focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2
            active:translate-y-0.5 active:shadow-[0_3px_5px_rgba(0,0,0,0.25)]
            transition-all duration-200 ease-in-out
          "
          onClick={() => navigate("/auth")}
        >
          Continue to Login
        </Button>

        {/* Optional modern background accents */}
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-blue-300/20 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-orange-300/20 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
      </div>

      {/* Footer */}
      <footer className="mt-10 text-gray-500 text-xs md:text-sm text-center">
        &copy; {new Date().getFullYear()} PACT Consultancy. All rights reserved.
      </footer>
    </div>
  );
};

export default Index;
