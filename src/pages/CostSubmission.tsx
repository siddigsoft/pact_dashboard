import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Plus, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { useUserCostSubmissions, useCostSubmissions } from "@/context/costApproval/CostSubmissionContext";
import { useAppContext } from "@/context/AppContext";
import { AppRole } from "@/types";
import CostSubmissionForm from "@/components/cost-submission/CostSubmissionForm";
import CostSubmissionHistory from "@/components/cost-submission/CostSubmissionHistory";
import { Skeleton } from "@/components/ui/skeleton";

const CostSubmission = () => {
  const navigate = useNavigate();
  const { currentUser, roles } = useAppContext();
  const { siteVisits } = useSiteVisitContext();
  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");

  // Check if user is admin
  const isAdmin = roles?.includes('admin' as AppRole) || currentUser?.role === 'admin';

  // Conditionally fetch based on role to prevent unnecessary API calls and data exposure
  // - Admins: Fetch all submissions (enabled), skip user-specific query (empty userId)
  // - Data collectors: Skip all submissions query (disabled), fetch only their submissions
  // Note: RLS policies at database level provide additional security layer
  const allSubmissionsQuery = useCostSubmissions(isAdmin);
  const userSubmissionsQuery = useUserCostSubmissions(isAdmin ? '' : (currentUser?.id || ''));
  
  const { submissions, isLoading } = isAdmin ? 
    { submissions: allSubmissionsQuery.submissions || [], isLoading: allSubmissionsQuery.isLoading } :
    { submissions: userSubmissionsQuery.submissions || [], isLoading: userSubmissionsQuery.isLoading };

  // Admins see all completed site visits, data collectors see only their own
  const availableSiteVisits = isAdmin 
    ? siteVisits.filter(visit => visit.status === 'completed')
    : siteVisits.filter(visit => visit.assignedTo === currentUser?.id && visit.status === 'completed');

  const submissionStats = {
    total: submissions.length,
    pending: submissions.filter(s => s.status === 'pending').length,
    underReview: submissions.filter(s => s.status === 'under_review').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
    paid: submissions.filter(s => s.status === 'paid').length
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-4"
          data-testid="button-back"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Cost Submission {isAdmin && <Badge variant="outline" className="ml-2">Admin View</Badge>}
          </h1>
          <p className="text-muted-foreground">
            {isAdmin 
              ? "View and manage all cost submissions across the platform"
              : "Submit actual costs for completed site visits and track approval status"
            }
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <Card data-testid="stat-pending">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-amber-600">{submissionStats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-under-review">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Under Review</p>
                <p className="text-2xl font-bold text-blue-600">{submissionStats.underReview}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-approved">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-600">{submissionStats.approved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-rejected">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{submissionStats.rejected}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-paid">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Paid</p>
                <p className="text-2xl font-bold text-primary">{submissionStats.paid}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-total">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{submissionStats.total}</p>
              </div>
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="submit" data-testid="tab-submit">
            <Plus className="h-4 w-4 mr-2" />
            Submit Costs
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <Clock className="h-4 w-4 mr-2" />
            Submission History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submit" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <Skeleton className="h-96 w-full" />
              </CardContent>
            </Card>
          ) : availableSiteVisits.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Completed Site Visits</h3>
                  <p className="text-muted-foreground">
                    {isAdmin 
                      ? "There are no completed site visits in the system yet."
                      : "You don't have any completed site visits yet. Complete a site visit to submit costs."
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <CostSubmissionForm siteVisits={availableSiteVisits} />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <Skeleton className="h-96 w-full" />
              </CardContent>
            </Card>
          ) : (
            <CostSubmissionHistory submissions={submissions} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CostSubmission;
