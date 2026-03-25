
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { MMPStage } from "@/types";
import { CircleOff, FileCheck, Hammer, CheckCircle2, FileEdit } from "lucide-react";
import { MMPStageChangeDialog } from "./MMPStageChangeDialog";

interface MMPStageIndicatorProps {
  stage: MMPStage;
  lastUpdated?: string;
  assignedTo?: string;
  mmpId: string;
  onStageChange?: (newStage: MMPStage) => void;
  status?: string;
}

const getStageColor = (stage: MMPStage) => {
  switch (stage) {
    case 'notStarted':
      return "bg-gray-100 text-gray-800";
    case 'draft':
      return "bg-blue-100 text-blue-800";
    case 'verified':
      return "bg-green-100 text-green-800";
    case 'implementation':
      return "bg-purple-100 text-purple-800";
    case 'completed':
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const getStageIcon = (stage: MMPStage) => {
  switch (stage) {
    case 'notStarted':
      return <CircleOff className="h-3.5 w-3.5" />;
    case 'draft':
      return <FileEdit className="h-3.5 w-3.5" />;
    case 'verified':
      return <FileCheck className="h-3.5 w-3.5" />;
    case 'implementation':
      return <Hammer className="h-3.5 w-3.5" />;
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    default:
      return <CircleOff className="h-3.5 w-3.5" />;
  }
};

export const MMPStageIndicator = ({ stage, lastUpdated, assignedTo, mmpId, onStageChange, status }: MMPStageIndicatorProps) => {
  return (
    <div className="flex items-center space-x-2">
      <Badge variant="outline" className={`${getStageColor(stage)} flex items-center gap-2`}>
        {getStageIcon(stage)}
        {stage === 'notStarted' ? 'Not Started' : stage.charAt(0).toUpperCase() + stage.slice(1)}
      </Badge>
      {status && (
        <Badge variant="outline" className={
          status === 'approved' ? "bg-green-100 text-green-800" : 
          status === 'rejected' ? "bg-red-100 text-red-800" : 
          "bg-amber-100 text-amber-800"
        }>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      )}
      {lastUpdated && (
        <span className="text-xs text-muted-foreground">
          Updated {new Date(lastUpdated).toLocaleDateString()}
        </span>
      )}
      {assignedTo && (
        <span className="text-xs text-muted-foreground">
          Assigned to {assignedTo}
        </span>
      )}
      {onStageChange && (
        <MMPStageChangeDialog
          currentStage={stage}
          mmpId={mmpId}
          onStageChange={onStageChange}
        />
      )}
    </div>
  );
};
