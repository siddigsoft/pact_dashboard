
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ClipboardList, 
  FileCheck, 
  MapPin, 
  Calendar, 
  Clock, 
  AlertCircle,
  MoreHorizontal
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/context/AppContext";
import { useProjectContext } from "@/context/project/ProjectContext";
import { formatDistanceToNow } from "date-fns";

interface Activity {
  id: string;
  title: string;
  description: string;
  type: "approval" | "upload" | "visit" | "reminder" | "alert";
  timestamp: string;
  status?: "pending" | "completed" | "critical";
  user?: string;
}

interface ActivityFeedProps {
  className?: string;
}

const ActivityFeed = ({ className }: ActivityFeedProps) => {
  const { mmpFiles, siteVisits, users } = useAppContext();
  const { projects } = useProjectContext();

  const getUserName = (id?: string) => {
    if (!id) return undefined;
    const u = (users || []).find((x: any) => x.id === id);
    return u?.name || u?.fullName || u?.username || id;
  };

  const mapStatus = (status?: string): Activity["status"] => {
    if (!status) return undefined;
    const s = String(status).toLowerCase();
    if (["approved", "completed", "archived", "verified"].includes(s)) return "completed";
    if (["rejected", "critical", "error", "failed"].includes(s)) return "critical";
    return "pending";
  };

  const activities: Activity[] = useMemo(() => {
    const items: Activity[] = [];

    try {
      // MMP files: uploads and approvals
      (mmpFiles || []).forEach((file: any) => {
        const uploadedAt: string | undefined = file?.uploadedAt || file?.createdAt || file?.modifiedAt;
        if (uploadedAt) {
          items.push({
            id: `mmp-upload-${file.id}`,
            title: `MMP Upload: ${file?.name || file?.originalFilename || file?.mmpId || file?.id}`,
            description: `Status: ${file?.status || "pending"}`,
            type: "upload",
            timestamp: uploadedAt,
            status: mapStatus(file?.status),
            user: file?.uploadedBy || undefined,
          });
        }
        if (file?.approvedAt) {
          items.push({
            id: `mmp-approval-${file.id}`,
            title: `MMP Approved: ${file?.name || file?.mmpId || file?.id}`,
            description: file?.approvedBy ? `Approved by ${getUserName(file.approvedBy)}` : "Approved",
            type: "approval",
            timestamp: file.approvedAt,
            status: "completed",
            user: getUserName(file?.approvedBy),
          });
        }
      });

      // Site visits: latest significant event
      (siteVisits || []).forEach((visit: any) => {
        const candidates = [visit?.completedAt, visit?.assignedAt, visit?.createdAt, visit?.dueDate].filter(Boolean) as string[];
        if (candidates.length === 0) return;
        const latestTs = candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

        let title = `Site Visit: ${visit?.siteName || visit?.siteCode || "Unknown"}`;
        let description = `${visit?.state || ""}${visit?.state && visit?.locality ? ", " : ""}${visit?.locality || ""}`.trim();
        let status: Activity["status"] = mapStatus(visit?.status);
        let type: Activity["type"] = "visit";
        let user: string | undefined = undefined;

        if (visit?.completedAt && latestTs === visit.completedAt) {
          title = `Site Visit Completed: ${visit?.siteName || visit?.siteCode || "Unknown"}`;
          status = "completed";
          user = getUserName(visit?.assignedTo);
        } else if (visit?.assignedAt && latestTs === visit.assignedAt) {
          title = `Site Visit Assigned: ${visit?.siteName || visit?.siteCode || "Unknown"}`;
          description = `Assigned to ${getUserName(visit?.assignedTo) || "team"}`;
          status = "pending";
          user = getUserName(visit?.assignedTo);
        } else if (visit?.createdAt && latestTs === visit.createdAt) {
          title = `Site Visit Created: ${visit?.siteName || visit?.siteCode || "Unknown"}`;
          status = "pending";
        } else if (visit?.dueDate && latestTs === visit.dueDate) {
          title = `Scheduled Site Visit: ${visit?.siteName || visit?.siteCode || "Unknown"}`;
          type = "reminder";
          status = "pending";
        }

        items.push({
          id: `site-visit-${visit?.id}`,
          title,
          description,
          type,
          timestamp: latestTs,
          status,
          user,
        });
      });

      // Project activities (basic signal)
      (projects || []).forEach((proj: any) => {
        (proj?.activities || []).forEach((act: any) => {
          const ts: string | undefined = act?.startDate || act?.endDate;
          if (!ts) return;
          const st = act?.status === "completed" ? "completed" : act?.status === "cancelled" ? "critical" : "pending";
          items.push({
            id: `project-activity-${act?.id}`,
            title: `Project Activity: ${act?.name || "Activity"}`,
            description: `${proj?.name || "Project"} • Status: ${act?.status || "pending"}`,
            type: "reminder",
            timestamp: ts,
            status: st as Activity["status"],
            user: undefined,
          });
        });
      });
    } catch (e) {
      console.error("Failed to build activity feed:", e);
    }

    return items
      .filter((it) => !!it.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 30);
  }, [mmpFiles, siteVisits, projects, users]);

  const getActivityIcon = (type: Activity["type"], status?: Activity["status"]) => {
    switch (type) {
      case "approval":
        return <FileCheck className="h-5 w-5 text-blue-500" />;
      case "upload":
        return <ClipboardList className="h-5 w-5 text-purple-500" />;
      case "visit":
        return <MapPin className="h-5 w-5 text-green-500" />;
      case "reminder":
        return <Calendar className="h-5 w-5 text-amber-500" />;
      case "alert":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status?: Activity["status"]) => {
    if (!status) return null;
    
    switch (status) {
      case "pending":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">Pending</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Completed</Badge>;
      case "critical":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 animate-pulse">Critical</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className={cn("border-t-4 border-t-blue-500 overflow-hidden transition-all hover:shadow-md", className)}>
      <CardHeader className="bg-slate-50 pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xl">
            <Clock className="h-5 w-5 text-primary" />
            Activity Feed
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[350px]">
          <div className="p-4 space-y-4">
            {activities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="flex gap-3 group hover:bg-slate-50 p-2 rounded-md transition-colors"
              >
                <div className="mt-0.5">
                  <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                    {getActivityIcon(activity.type, activity.status)}
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-sm">{activity.title}</h4>
                    {getStatusBadge(activity.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{activity.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{activity.timestamp ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true }) : ""}</span>
                    {activity.user && (
                      <>
                        <span>•</span>
                        <span>{activity.user}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ActivityFeed;
