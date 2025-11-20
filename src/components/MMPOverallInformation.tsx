
import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Save, CheckCircle, FileSpreadsheet, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MMPFile } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { parseMMPId } from "@/utils/mmpIdGenerator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAppContext } from "@/context/AppContext";

interface MMPOverallInformationProps {
  mmpFile: MMPFile;
  onUpdate?: (updatedMMP: MMPFile) => void;
  editable?: boolean;
}

const MMPOverallInformation = ({ mmpFile, onUpdate, editable = false }: MMPOverallInformationProps) => {
  const { toast } = useToast();
  const { updateMMPVersion } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState(mmpFile);
  const [reviewed, setReviewed] = useState(false);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [versionChanges, setVersionChanges] = useState("");

  // Parse the MMP ID to extract components
  const parsedId = mmpFile.mmpId ? parseMMPId(mmpFile.mmpId) : null;
  const currentVersion = mmpFile.version ? 
    `${mmpFile.version.major}.${mmpFile.version.minor}` : 
    parsedId ? 
      `${parsedId.version.major}.${parsedId.version.minor}` : 
      "1.0";

  const handleSave = () => {
    onUpdate?.(editedData);
    setIsEditing(false);
    toast({
      description: "MMP details updated successfully",
    });
  };

  const handleMarkAsReviewed = () => {
    setReviewed(true);
    toast({
      description: "MMP has been marked as reviewed",
    });
  };

  const handleCreateNewVersion = async () => {
    if (!versionChanges.trim()) {
      toast({
        title: "Error",
        description: "Please provide a description of the changes",
        variant: "destructive",
      });
      return;
    }

    // Fix: Don't check Promise<boolean> for truthiness directly
    const result = await updateMMPVersion(mmpFile.id, versionChanges);
    if (result) {
      setIsVersionDialogOpen(false);
      setVersionChanges("");
      toast({
        description: "MMP version updated successfully",
      });
    }
  };

  if (!editable) {
    return (
      <div className="space-y-4">
        <div>
          <Link 
            to={`/mmp/${mmpFile.id}`} 
            className="hover:text-primary transition-colors"
          >
            <h3 className="font-medium text-lg">{mmpFile.name}</h3>
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">MMP ID: {mmpFile.mmpId || "Not assigned yet"}</span>
            {mmpFile.mmpId && (
              <Badge variant="outline" className="ml-2 flex items-center">
                <GitBranch className="h-3 w-3 mr-1" />
                v{currentVersion}
              </Badge>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Project Name</h4>
              <p>{mmpFile.name}</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Type</h4>
              <p>Field Monitoring</p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
              <Badge>{mmpFile.status}</Badge>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Location</h4>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <p>{mmpFile.location?.address || mmpFile.location?.region || mmpFile.region || "Not specified"}</p>
              </div>
              {mmpFile.location?.state && (
                <p className="text-sm text-muted-foreground ml-6 mt-1">{mmpFile.location.state}</p>
              )}
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Team Assignment</h4>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm">Coordinator:</span>
                  <span className="font-medium">{mmpFile.uploadedBy}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          {isEditing ? (
            <Input
              value={editedData.name}
              onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
              className="font-medium text-lg"
            />
          ) : (
            <h3 className="font-medium text-lg">{mmpFile.name}</h3>
          )}
          
          <div className="flex items-center gap-2 mt-1">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">MMP ID: {mmpFile.mmpId || "Not assigned yet"}</span>
            {mmpFile.mmpId && (
              <Badge variant="outline" className="ml-2 flex items-center">
                <GitBranch className="h-3 w-3 mr-1" />
                v{currentVersion}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!reviewed && (
            <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={handleMarkAsReviewed}
            >
              <CheckCircle className="h-4 w-4" />
              Mark as Reviewed
            </Button>
          )}
          
          <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Create New Version
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Version</DialogTitle>
                <DialogDescription>
                  This will create a new minor version of the MMP document. Please describe the changes.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm mb-2">Current Version: v{currentVersion}</p>
                <p className="text-sm mb-4">New Version: v{mmpFile.version ? `${mmpFile.version.major}.${mmpFile.version.minor + 1}` : "1.1"}</p>
                <Textarea
                  placeholder="Describe the changes in this version..."
                  value={versionChanges}
                  onChange={(e) => setVersionChanges(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsVersionDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateNewVersion}>Save New Version</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {editable && !isEditing && (
            <Button onClick={() => setIsEditing(true)}>
              Edit Details
            </Button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Project Name</h4>
            {isEditing ? (
              <Input
                value={editedData.name}
                onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
              />
            ) : (
              <p>{mmpFile.name}</p>
            )}
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Type</h4>
            <p>Field Monitoring</p>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
            <Badge>{mmpFile.status}</Badge>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Location</h4>
            <div className="space-y-2">
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={editedData.location?.address || editedData.region || ""}
                      onChange={(e) => {
                        const updatedLocation = editedData.location ? 
                          { ...editedData.location, address: e.target.value } : 
                          { address: e.target.value };
                        setEditedData({ 
                          ...editedData, 
                          location: updatedLocation,
                          region: e.target.value 
                        });
                      }}
                      placeholder="Enter address or region"
                    />
                  </div>
                  
                  <Input
                    value={editedData.location?.state || ""}
                    onChange={(e) => {
                      const updatedLocation = editedData.location ? 
                        { ...editedData.location, state: e.target.value } : 
                        { state: e.target.value };
                      setEditedData({ 
                        ...editedData, 
                        location: updatedLocation 
                      });
                    }}
                    placeholder="Enter state"
                    className="ml-6"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <p>{mmpFile.location?.address || mmpFile.location?.region || mmpFile.region || "Not specified"}</p>
                  </div>
                  {mmpFile.location?.state && (
                    <p className="text-sm text-muted-foreground ml-6">{mmpFile.location.state}</p>
                  )}
                </>
              )}
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Team Assignment</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm">Coordinator:</span>
                {isEditing ? (
                  <Input
                    value={editedData.uploadedBy}
                    onChange={(e) => setEditedData({ ...editedData, uploadedBy: e.target.value })}
                    className="w-48"
                  />
                ) : (
                  <span className="font-medium">{mmpFile.uploadedBy}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      )}

      {reviewed && (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-md mt-4">
          <CheckCircle className="h-5 w-5" />
          <span>This MMP has been reviewed</span>
        </div>
      )}
      
      {mmpFile.mmpId && parsedId && (
        <div className="bg-blue-50 p-4 rounded-md border border-blue-100 mt-4">
          <h4 className="font-medium text-blue-800 mb-2">MMP ID Information</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-700">Month:</span>
              <span className="font-medium">{parsedId.month}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">Year:</span>
              <span className="font-medium">{parsedId.year}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">Version:</span>
              <span className="font-medium">{parsedId.version.major}.{parsedId.version.minor}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">Region Code:</span>
              <span className="font-medium">{parsedId.region}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MMPOverallInformation;
