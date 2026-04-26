import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getPendingApprovalsForUser, approveTask, rejectTask, addApprovalComment } from '@/services/approval-workflows.service';
import { CheckCircle, XCircle, AlertCircle, MessageSquare, Clock } from 'lucide-react';

interface ApprovalRecord {
  id: string;
  status: string;
  task_approvals: {
    id: string;
    task_id: string;
    workflow_id: string;
    current_stage_number: number;
    status: string;
    submitted_at: string;
    approval_workflows: {
      name: string;
    };
  };
}

interface ApprovalPendingCardProps {
  onApprovalComplete?: () => void;
  /** When true, suppress the inner "Pending Approvals" h3 + badge so the
   * card can be embedded inside an outer titled container (e.g. a tab). */
  hideHeader?: boolean;
}

export const ApprovalPendingCard: React.FC<ApprovalPendingCardProps> = ({ onApprovalComplete, hideHeader = false }) => {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPendingApprovals();
    const interval = setInterval(loadPendingApprovals, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadPendingApprovals = async () => {
    setLoading(true);
    const { approvals, error } = await getPendingApprovalsForUser(20);
    if (!error) {
      setPendingApprovals(approvals as any);
    }
    setLoading(false);
  };

  const handleApprove = async (taskApprovalId: string) => {
    setSubmitting(true);
    const { success, message } = await approveTask(taskApprovalId, decisionNotes);
    if (success) {
      setDecisionNotes('');
      setSelectedApproval(null);
      await loadPendingApprovals();
      onApprovalComplete?.();
    } else {
      alert(`Error: ${message}`);
    }
    setSubmitting(false);
  };

  const handleReject = async (taskApprovalId: string) => {
    setSubmitting(true);
    const { success, message } = await rejectTask(taskApprovalId, decisionNotes);
    if (success) {
      setDecisionNotes('');
      setSelectedApproval(null);
      await loadPendingApprovals();
      onApprovalComplete?.();
    } else {
      alert(`Error: ${message}`);
    }
    setSubmitting(false);
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading pending approvals...</div>;
  }

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Pending Approvals</h3>
          <span className="bg-red-100 text-red-800 text-sm font-medium px-3 py-1 rounded-full">
            {pendingApprovals.length} pending
          </span>
        </div>
      )}

      {pendingApprovals.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-500" />
          <p>No pending approvals. Good job!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingApprovals.map((approval) => (
            <div
              key={approval.id}
              className={`border rounded-lg p-4 cursor-pointer transition ${
                selectedApproval === approval.task_approvals.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedApproval(approval.task_approvals.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <h4 className="font-medium text-gray-900">
                      {approval.task_approvals.approval_workflows.name}
                    </h4>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Task ID: {approval.task_approvals.task_id}
                  </p>
                  <p className="text-sm text-gray-500">
                    Submitted:{' '}
                    {new Date(approval.task_approvals.submitted_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-500">
                    Stage: {approval.task_approvals.current_stage_number}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded">
                    {approval.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {selectedApproval === approval.task_approvals.id && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <textarea
                    value={decisionNotes}
                    onChange={(e) => setDecisionNotes(e.target.value)}
                    placeholder="Add decision notes (optional)..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(approval.task_approvals.id)}
                      disabled={submitting}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-md flex items-center justify-center gap-2 transition"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(approval.task_approvals.id)}
                      disabled={submitting}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-md flex items-center justify-center gap-2 transition"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
