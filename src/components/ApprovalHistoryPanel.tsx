import React, { useState, useEffect } from 'react';
import { getTaskApprovalHistory } from '@/services/approval-workflows.service';
import { CheckCircle, XCircle, Clock, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ApprovalHistoryPanelProps {
  taskId: string;
}

interface ApprovalStageRecord {
  id: string;
  stage_number: number;
  status: string;
  decided_at: string | null;
  decision_notes: string | null;
  approval_comments?: Array<{
    id: string;
    comment_text: string;
    comment_type: string;
    created_at: string;
  }>;
}

export const ApprovalHistoryPanel: React.FC<ApprovalHistoryPanelProps> = ({ taskId }) => {
  const [approval, setApproval] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadApprovalHistory();
  }, [taskId]);

  const loadApprovalHistory = async () => {
    setLoading(true);
    const { approval: data, error } = await getTaskApprovalHistory(taskId);
    if (!error && data) {
      setApproval(data);
    }
    setLoading(false);
  };

  const toggleStageExpanded = (stageId: string) => {
    const newExpanded = new Set(expandedStages);
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId);
    } else {
      newExpanded.add(stageId);
    }
    setExpandedStages(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending':
      case 'escalated':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'escalated':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-gray-500">Loading approval history...</div>;
  }

  if (!approval) {
    return <div className="text-center py-4 text-gray-500">No approval history found</div>;
  }

  const records = approval.task_approval_records || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Approval History</h3>
        <span className={`text-sm font-medium px-3 py-1 rounded-full ${getStatusColor(approval.status)}`}>
          {approval.status.toUpperCase()}
        </span>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
        Workflow: <strong>{approval.approval_workflows?.name}</strong> • Submitted{' '}
        {formatDistanceToNow(new Date(approval.submitted_at), { addSuffix: true })}
      </div>

      <div className="space-y-2">
        {records.map((record: ApprovalStageRecord, index: number) => (
          <div key={record.id} className="border border-gray-200 rounded-lg">
            {/* Stage Header */}
            <button
              onClick={() => toggleStageExpanded(record.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3 flex-1">
                {getStatusIcon(record.status)}
                <div className="text-left">
                  <div className="font-medium text-gray-900">Stage {record.stage_number}</div>
                  <div className="text-sm text-gray-500">
                    {record.status === 'pending' && 'Awaiting approval'}
                    {record.status === 'approved' && `Approved ${record.decided_at ? formatDistanceToNow(new Date(record.decided_at), { addSuffix: true }) : ''}`}
                    {record.status === 'rejected' && `Rejected ${record.decided_at ? formatDistanceToNow(new Date(record.decided_at), { addSuffix: true }) : ''}`}
                  </div>
                </div>
              </div>
              <div>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${getStatusColor(record.status)}`}>
                  {record.status}
                </span>
                {expandedStages.has(record.id) ? (
                  <ChevronUp className="h-4 w-4 text-gray-400 ml-2 inline" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400 ml-2 inline" />
                )}
              </div>
            </button>

            {/* Stage Details */}
            {expandedStages.has(record.id) && (
              <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 space-y-3">
                {record.decision_notes && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Decision Notes:</p>
                    <p className="text-sm text-gray-600 mt-1">{record.decision_notes}</p>
                  </div>
                )}

                {record.approval_comments && record.approval_comments.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Comments ({record.approval_comments.length})
                    </p>
                    <div className="space-y-2">
                      {record.approval_comments.map((comment) => (
                        <div key={comment.id} className="bg-white p-2 rounded border border-gray-200 text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              comment.comment_type === 'concern'
                                ? 'bg-red-100 text-red-700'
                                : comment.comment_type === 'suggestion'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-700'
                            }`}>
                              {comment.comment_type}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-gray-700">{comment.comment_text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {approval.status === 'approved' && approval.completed_at && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          All approvals completed on {new Date(approval.completed_at).toLocaleDateString()}
        </div>
      )}

      {approval.status === 'rejected' && approval.completed_at && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <XCircle className="h-4 w-4" />
          Approval rejected on {new Date(approval.completed_at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
};
