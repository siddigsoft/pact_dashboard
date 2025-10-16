
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import MMPOverallInformation from '@/components/MMPOverallInformation';
import MMPVersionHistory from '@/components/MMPVersionHistory';
import MMPSiteInformation from '@/components/MMPSiteInformation';
import { ActivityManager } from '@/components/project/activity/ActivityManager';
import { useToast } from '@/hooks/use-toast';
import FieldTeamMapPermissions from '@/components/map/FieldTeamMapPermissions';

const EditMMP: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMmpById, updateMMP } = useMMP();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [mmpFile, setMmpFile] = useState<any>(null);

  const handleGoBack = () => {
    navigate('/mmp');
  };

  useEffect(() => {
    if (id) {
      console.log("Looking for MMP with ID:", id);
      const mmp = getMmpById(id);
      if (mmp) {
        console.log("Retrieved MMP for editing:", mmp);
        setMmpFile(mmp);
        setLoading(false);
      } else {
        toast({
          title: "MMP Not Found",
          description: "The MMP you're trying to edit does not exist.",
          variant: "destructive"
        });
        navigate("/mmp");
      }
    }
  }, [id, getMmpById, navigate, toast]);

  const handleUpdate = (updatedMMP: any) => {
    console.log("Updating MMP with:", updatedMMP);
    if (updateMMP && id) {
      updateMMP(id, updatedMMP);
      setMmpFile(updatedMMP);
      toast({
        title: "MMP Updated",
        description: "The MMP has been successfully updated.",
      });
    }
  };

  const handleActivitiesChange = (activities: any[]) => {
    if (mmpFile && updateMMP) {
      const updatedMMP = {
        ...mmpFile,
        activities: activities
      };
      updateMMP(id!, updatedMMP);
      setMmpFile(updatedMMP);
      toast({
        title: "Activities Updated",
        description: "The activities have been successfully updated.",
      });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              Loading MMP information...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <FieldTeamMapPermissions resource="mmp" action="update">
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4 mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleGoBack}
            className="mr-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{mmpFile?.name}</h1>
            <p className="text-muted-foreground">{mmpFile?.mmpId}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit MMP</CardTitle>
            <CardDescription>Update details for MMP: {mmpFile?.mmpId}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="details" className="space-y-4">
              <TabsList>
                <TabsTrigger value="details">MMP Details</TabsTrigger>
                <TabsTrigger value="sites">Sites</TabsTrigger>
                <TabsTrigger value="activities">Activities</TabsTrigger>
                <TabsTrigger value="history">Version History</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <MMPOverallInformation 
                  mmpFile={mmpFile} 
                  onUpdate={handleUpdate}
                  editable={true}
                />
              </TabsContent>

              <TabsContent value="sites" className="space-y-4">
                <MMPSiteInformation 
                  mmpFile={mmpFile}
                  showVerificationButton={false}
                  onUpdateMMP={handleUpdate}
                />
              </TabsContent>

              <TabsContent value="activities" className="space-y-4">
                <ActivityManager
                  activities={mmpFile.activities || []}
                  onActivitiesChange={handleActivitiesChange}
                  projectType={mmpFile.type}
                />
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <MMPVersionHistory mmpFile={mmpFile} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </FieldTeamMapPermissions>
  );
};

export default EditMMP;
