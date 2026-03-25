
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const SiteVisitHeader = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/site-visits");
  };

  return (
    <div className="flex items-center gap-4 bg-gradient-to-r from-background to-muted p-4 rounded-lg shadow-sm">
      <Button variant="ghost" size="sm" onClick={handleBack} className="mr-2">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back
      </Button>
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Site Visit Details
        </h1>
        <p className="text-muted-foreground text-sm">View site visit information</p>
      </div>
    </div>
  );
};
