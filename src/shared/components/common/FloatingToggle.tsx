
import React from 'react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface FloatingToggleProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  label: string;
  className?: string;
}

const FloatingToggle: React.FC<FloatingToggleProps> = ({
  isEnabled,
  onToggle,
  label,
  className = ""
}) => {
  return (
    <div className={`fixed bottom-20 right-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-lg rounded-full p-3 flex items-center gap-2 border ${className}`}>
      <Switch
        id="floating-toggle"
        checked={isEnabled}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-primary"
      />
      <Label htmlFor="floating-toggle" className="text-sm font-medium">
        {label}
      </Label>
    </div>
  );
};

export default FloatingToggle;
