
import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, Trash2, Edit } from 'lucide-react';
import { ProjectActivity, SubActivity, ProjectTeamMember } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ActivityForm from './ActivityForm';  // Import the default export
import { SubActivityForm } from './SubActivityForm';
import { cn } from '@/lib/utils';
import { TeamCompositionManager } from '@/components/project/team/TeamCompositionManager';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ActivityManagerProps {
  activities: ProjectActivity[];
  onActivitiesChange: (activities: ProjectActivity[]) => void;
  projectType?: string;
}

export const ActivityManager = ({
  activities,
  onActivitiesChange,
  projectType,
}: ActivityManagerProps) => {
  const [openActivityDialogs, setOpenActivityDialogs] = useState<{[key: string]: boolean}>({});
  const [openSubActivityDialogs, setOpenSubActivityDialogs] = useState<{[key: string]: boolean}>({});
  const [expandedActivities, setExpandedActivities] = useState<{[key: string]: boolean}>({});

  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);
  const [overloadedMembers, setOverloadedMembers] = useState<string[]>([]);

  useEffect(() => {
    // In a real app, this would be fetched from an API
    const checkTeamWorkload = () => {
      const overloaded = teamMembers
        .filter(member => (member.workload || 0) > 80)
        .map(member => member.userId);
      setOverloadedMembers(overloaded);
    };

    checkTeamWorkload();
  }, [teamMembers]);

  const handleAddActivity = (activity: Partial<ProjectActivity>) => {
    const newActivity = {
      ...activity,
      id: `act-${Date.now()}`,
      subActivities: [],
    } as ProjectActivity;
    
    onActivitiesChange([...activities, newActivity]);
    setOpenActivityDialogs({ ...openActivityDialogs, new: false });
  };

  const handleEditActivity = (activityId: string, updatedActivity: Partial<ProjectActivity>) => {
    const updatedActivities = activities.map(activity =>
      activity.id === activityId
        ? { ...activity, ...updatedActivity }
        : activity
    );
    onActivitiesChange(updatedActivities);
    setOpenActivityDialogs({ ...openActivityDialogs, [activityId]: false });
  };

  const handleDeleteActivity = (activityId: string) => {
    onActivitiesChange(activities.filter(activity => activity.id !== activityId));
  };

  const handleAddSubActivity = (activityId: string, subActivity: Partial<SubActivity>) => {
    const updatedActivities = activities.map(activity => {
      if (activity.id === activityId) {
        return {
          ...activity,
          subActivities: [...activity.subActivities, subActivity as SubActivity],
        };
      }
      return activity;
    });
    onActivitiesChange(updatedActivities);
    setOpenSubActivityDialogs({ ...openSubActivityDialogs, [activityId]: false });
  };

  const handleEditSubActivity = (
    activityId: string,
    subActivityId: string,
    updatedSubActivity: Partial<SubActivity>
  ) => {
    const updatedActivities = activities.map(activity => {
      if (activity.id === activityId) {
        return {
          ...activity,
          subActivities: activity.subActivities.map(subActivity =>
            subActivity.id === subActivityId
              ? { ...subActivity, ...updatedSubActivity }
              : subActivity
          ),
        };
      }
      return activity;
    });
    onActivitiesChange(updatedActivities);
    setOpenSubActivityDialogs({ ...openSubActivityDialogs, [`${activityId}-${subActivityId}`]: false });
  };

  const getStatusBadge = (status: string): "default" | "destructive" | "outline" | "secondary" => {
    switch (status) {
      case 'pending':
        return 'default';
      case 'inProgress':
        return 'secondary';
      case 'completed':
        return 'outline';
      case 'cancelled':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const handleAssignActivity = (activityId: string, userId: string) => {
    const updatedActivities = activities.map(activity => {
      if (activity.id === activityId) {
        return {
          ...activity,
          assignedTo: userId
        };
      }
      return activity;
    });
    onActivitiesChange(updatedActivities);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Activities</h3>
        <Button
          onClick={() => setOpenActivityDialogs({ ...openActivityDialogs, new: true })}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" /> Add Activity
        </Button>
      </div>

      <div className="space-y-2">
        {activities.map((activity) => (
          <Collapsible
            key={activity.id}
            open={expandedActivities[activity.id]}
            onOpenChange={(isOpen) =>
              setExpandedActivities({ ...expandedActivities, [activity.id]: isOpen })
            }
            className="border rounded-lg p-2"
          >
            <div className="flex items-center justify-between">
              <CollapsibleTrigger className="flex items-center hover:bg-muted/50 rounded-md px-2 py-1 w-full">
                <div className="flex items-center">
                  {expandedActivities[activity.id] ? (
                    <ChevronDown className="h-4 w-4 mr-2" />
                  ) : (
                    <ChevronRight className="h-4 w-4 mr-2" />
                  )}
                  <span className="font-medium">{activity.name}</span>
                </div>
                <Badge variant={getStatusBadge(activity.status)} className="ml-2">
                  {activity.status}
                </Badge>
              </CollapsibleTrigger>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActivityDialogs({ ...openActivityDialogs, [activity.id]: true });
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteActivity(activity.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <CollapsibleContent className="pt-2">
              <div className="pl-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">Assignment</h4>
                  <Select
                    value={activity.assignedTo}
                    onValueChange={(value) => handleAssignActivity(activity.id, value)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Assign to team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map((member) => (
                        <SelectItem
                          key={member.userId}
                          value={member.userId}
                          className={cn(
                            overloadedMembers.includes(member.userId) && 
                            "text-yellow-500 font-medium"
                          )}
                        >
                          {member.name} {overloadedMembers.includes(member.userId) && "(High Workload)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">Sub-Activities</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setOpenSubActivityDialogs({ ...openSubActivityDialogs, [activity.id]: true })
                    }
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Sub-Activity
                  </Button>
                </div>

                <div className="space-y-1">
                  {activity.subActivities.map((subActivity) => (
                    <div
                      key={subActivity.id}
                      className="flex items-center justify-between bg-muted/50 rounded-md p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{subActivity.name}</span>
                        <Badge variant={getStatusBadge(subActivity.status)} className="text-xs">
                          {subActivity.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setOpenSubActivityDialogs({
                              ...openSubActivityDialogs,
                              [`${activity.id}-${subActivity.id}`]: true,
                            })
                          }
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleContent>

            {/* Edit Sub-Activity Dialog */}
            {activity.subActivities.map((subActivity) => (
              <Dialog
                key={`${activity.id}-${subActivity.id}`}
                open={openSubActivityDialogs[`${activity.id}-${subActivity.id}`]}
                onOpenChange={(isOpen) =>
                  setOpenSubActivityDialogs({
                    ...openSubActivityDialogs,
                    [`${activity.id}-${subActivity.id}`]: isOpen,
                  })
                }
              >
                <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Sub-Activity</DialogTitle>
                  </DialogHeader>
                  <SubActivityForm
                    initialData={subActivity}
                    onSubmit={(data) => handleEditSubActivity(activity.id, subActivity.id, data)}
                    onCancel={() =>
                      setOpenSubActivityDialogs({
                        ...openSubActivityDialogs,
                        [`${activity.id}-${subActivity.id}`]: false,
                      })
                    }
                  />
                </DialogContent>
              </Dialog>
            ))}
          </Collapsible>
        ))}
      </div>

      {/* Add/Edit Activity Dialog */}
      <Dialog
        open={openActivityDialogs.new}
        onOpenChange={(isOpen) => setOpenActivityDialogs({ ...openActivityDialogs, new: isOpen })}
      >
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Activity</DialogTitle>
          </DialogHeader>
          <ActivityForm
            onSubmit={handleAddActivity}
            onCancel={() => setOpenActivityDialogs({ ...openActivityDialogs, new: false })}
            projectType={projectType}
          />
        </DialogContent>
      </Dialog>

      {/* Add Sub-Activity Dialog */}
      {activities.map((activity) => (
        <React.Fragment key={activity.id}>
          {activity.subActivities.map((subActivity) => (
            <Dialog
              key={`${activity.id}-${subActivity.id}`}
              open={openSubActivityDialogs[`${activity.id}-${subActivity.id}`]}
              onOpenChange={(isOpen) =>
                setOpenSubActivityDialogs({
                  ...openSubActivityDialogs,
                  [`${activity.id}-${subActivity.id}`]: isOpen,
                })
              }
            >
              <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Sub-Activity</DialogTitle>
                </DialogHeader>
                <SubActivityForm
                  initialData={subActivity}
                  onSubmit={(data) => handleEditSubActivity(activity.id, subActivity.id, data)}
                  onCancel={() =>
                    setOpenSubActivityDialogs({
                      ...openSubActivityDialogs,
                      [`${activity.id}-${subActivity.id}`]: false,
                    })
                  }
                />
              </DialogContent>
            </Dialog>
          ))}
          <Dialog
            open={openSubActivityDialogs[activity.id]}
            onOpenChange={(isOpen) =>
              setOpenSubActivityDialogs({ ...openSubActivityDialogs, [activity.id]: isOpen })
            }
          >
            <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Sub-Activity</DialogTitle>
              </DialogHeader>
              <SubActivityForm
                onSubmit={(data) => handleAddSubActivity(activity.id, data)}
                onCancel={() =>
                  setOpenSubActivityDialogs({ ...openSubActivityDialogs, [activity.id]: false })
                }
              />
            </DialogContent>
          </Dialog>
        </React.Fragment>
      ))}
    </div>
  );
};
