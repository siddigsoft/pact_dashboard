import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PactLogo from "@/assets/logo.png";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem("mock_mmp_files")) {
      localStorage.setItem("mock_mmp_files", JSON.stringify([]));
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50/20 via-orange-50/20 to-gray-100 dark:from-black dark:via-gray-900 dark:to-gray-800 px-4 py-14 md:py-22 text-center relative overflow-hidden">
      {/* Logo */}
      <img
        src={PactLogo}
        alt="PACT Logo"
        className="h-28 w-28 md:h-32 md:w-32 mb-8"
      />

      {/* Main Heading */}
      <h1 className="text-4xl md:text-5xl font-extrabold mb-4 text-blue-600">
        PACT Workflow Platform
      </h1>

      {/* Subheading */}
      <p className="text-gray-700 dark:text-gray-300 text-base md:text-lg mb-10 max-w-xl">
        Streamlined MMP Management System for seamless field operations
      </p>

      {/* Feature Badges */}
      <div className="flex flex-wrap justify-center gap-3 mb-10">
        <span className="px-4 py-2 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium shadow-md hover:scale-105 transition-all duration-300">
          Project Management
        </span>
        <span className="px-4 py-2 bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200 rounded-full text-sm font-medium shadow-md hover:scale-105 transition-all duration-300">
          Field Operations
        </span>
        <span className="px-4 py-2 bg-black/10 dark:bg-white/10 text-black dark:text-white rounded-full text-sm font-medium shadow-md hover:scale-105 transition-all duration-300">
          Advanced Reporting
        </span>
      </div>

      {/* Continue Button */}
      <Button
        className="
          mb-8 px-8 py-3 font-semibold rounded-lg text-white
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

      {/* Soft floating background accents */}
      <div className="absolute -top-32 -left-24 w-64 h-64 bg-blue-300/20 rounded-full blur-3xl animate-blob"></div>
      <div className="absolute -bottom-40 -right-32 w-72 h-72 bg-orange-300/20 rounded-full blur-3xl animate-blob animation-delay-2000"></div>

      {/* Footer */}
      <footer className="mt-10 text-gray-500 text-xs md:text-sm">
        &copy; {new Date().getFullYear()} PACT Consultancy. All rights reserved.
      </footer>
    </div>
  );
};

export default Index;
