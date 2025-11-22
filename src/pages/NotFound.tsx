
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );

    // Auto-redirect for common incorrect URL patterns
    if (location.pathname.startsWith('/mmp/view/')) {
      const mmpId = location.pathname.split('/').pop();
      if (mmpId) {
        navigate(`/mmp/${mmpId}/view`, { replace: true });
      }
    } else if (location.pathname.startsWith('/mmp/edit/')) {
      // Auto-redirect from /mmp/edit/:id to /mmp/:id/edit
      const mmpId = location.pathname.split('/').pop();
      if (mmpId) {
        navigate(`/mmp/${mmpId}/edit`, { replace: true });
      }
    } else if (location.pathname === '/advanced-map') {
      // Auto-redirect from /advanced-map to /map
      navigate('/map', { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleReturn = () => {
    // Improved navigation logic to handle more cases correctly
    if (location.pathname.startsWith('/mmp/view/')) {
      // Extract the MMP ID from the URL
      const mmpId = location.pathname.split('/').pop();
      // If we have an MMP ID, navigate to the correct view page
      if (mmpId) {
        navigate(`/mmp/${mmpId}/view`);
        return;
      }
    } else if (location.pathname.startsWith('/mmp/edit/')) {
      // Extract the MMP ID from the URL
      const mmpId = location.pathname.split('/').pop();
      // If we have an MMP ID, navigate to the correct edit page
      if (mmpId) {
        navigate(`/mmp/${mmpId}/edit`);
        return;
      }
    }
    
    if (location.pathname === '/advanced-map') {
      navigate("/map");
    } else if (location.pathname.startsWith('/users/')) {
      navigate("/users");
    } else if (location.pathname.startsWith('/site-visits/')) {
      navigate("/site-visits");
    } else if (location.pathname.startsWith('/field-team/')) {
      navigate("/field-team");
    } else if (location.pathname.startsWith('/mmp/verify/')) {
      // Extract the MMP ID from the URL
      const mmpId = location.pathname.split('/').pop();
      // If we have an MMP ID, navigate to the view page
      if (mmpId) {
        navigate(`/mmp/${mmpId}/view`);
      } else {
        navigate("/mmp");
      }
    } else {
      // If we can't determine a specific parent route, go back in browser history
      // or default to dashboard if that doesn't work
      try {
        navigate(-1);
      } catch (e) {
        navigate("/dashboard");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div className="mb-6 w-24 h-24 bg-red-50 rounded-full mx-auto flex items-center justify-center">
          <span className="text-7xl font-bold text-red-500">!</span>
        </div>
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-6">The page you're looking for doesn't exist.</p>
        <p className="text-gray-500 mb-6">
          The URL <span className="font-mono bg-gray-100 p-1 rounded">{location.pathname}</span> might be incorrect 
          or the page may have been moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button 
            className="flex items-center justify-center gap-2 w-full sm:w-auto" 
            onClick={handleReturn}
            variant="default"
          >
            <ArrowLeft className="h-4 w-4" /> 
            Return to Previous Page
          </Button>
          <Button 
            className="flex items-center justify-center gap-2 w-full sm:w-auto" 
            onClick={() => navigate("/dashboard")}
            variant="outline"
          >
            <Home className="h-4 w-4" /> 
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
