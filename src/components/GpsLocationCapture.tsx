
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Navigation, MapPin } from "lucide-react";
import { User } from "@/types";

interface GpsLocationCaptureProps {
  user: User;
  onLocationCapture: (latitude: number, longitude: number, accuracy?: number) => void;
  className?: string;
}

const GpsLocationCapture: React.FC<GpsLocationCaptureProps> = ({ 
  user, 
  onLocationCapture,
  className = "" 
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const captureLocation = () => {
    setIsCapturing(true);
    setErrorMessage(null);

    if (!navigator.geolocation) {
      setErrorMessage("Geolocation is not supported by your browser");
      setIsCapturing(false);
      toast({
        title: "GPS Error",
        description: "Geolocation is not supported by your browser",
        variant: "destructive"
      });
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        onLocationCapture(latitude, longitude, accuracy);
        setIsCapturing(false);
        toast({
          title: "Location Updated",
          description: `GPS captured with accuracy: ±${accuracy.toFixed(1)}m`,
          variant: "default"
        });
      },
      (error) => {
        let errorMsg = "Unknown error capturing location";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = "User denied the request for geolocation";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = "Location information is unavailable";
            break;
          case error.TIMEOUT:
            errorMsg = "The request to get user location timed out";
            break;
        }
        setErrorMessage(errorMsg);
        setIsCapturing(false);
        toast({
          title: "GPS Error",
          description: errorMsg,
          variant: "destructive"
        });
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
    );
  };

  return (
    <div className={`${className}`}>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={captureLocation}
        disabled={isCapturing}
        className="flex items-center gap-2"
      >
        {isCapturing ? (
          <>
            <span className="animate-spin mr-1">
              <Navigation className="h-4 w-4" />
            </span>
            Capturing...
          </>
        ) : (
          <>
            <MapPin className="h-4 w-4" />
            Update GPS Location
          </>
        )}
      </Button>
      
      {errorMessage && (
        <p className="text-xs text-red-500 mt-1">{errorMessage}</p>
      )}
    </div>
  );
};

export default GpsLocationCapture;
