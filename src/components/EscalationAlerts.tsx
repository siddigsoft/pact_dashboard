import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getActiveEscalationsForUser, resolveEscalation, acknowledgeEscalation } from '@/services/sla-escalation.service';
import { AlertTriangle, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface EscalationRecord {
  id: string;
  task_id: string;
  escalation_level: number;
  escalated_from_user_id: string | null;
  escalation_reason: string | null;
  sla_breach_at: string;
  escalated_at: string;
  status: string;
}

interface EscalationAlertsProps {
  onEscalationResolved?: () => void;
  autoRefreshSeconds?: number;
}

export const EscalationAlerts: React.FC<EscalationAlertsProps> = ({
  onEscalationResolved,
  autoRefreshSeconds = 30,
}) => {
  const [escalations, setEscalations] = useState<EscalationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEscalation, setExpandedEscalation] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  useEffect(() => {
    loadEscalations();
    const interval = setInterval(loadEscalations, autoRefreshSeconds * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSeconds]);

  const loadEscalations = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { escalations: data, error } = await getActiveEscalationsForUser(userData.user.id);
      if (!error) {
        setEscalations(data as any);
      }
    }
    setLoading(false);
  };

  const handleResolve = async (escalationId: string) => {
    setActingOnId(escalationId);
    const { success, message } = await resolveEscalation(escalationId, 'Escalation resolved by approver');
    if (success) {
      await loadEscalations();
      onEscalationResolved?.();
    } else {
      alert(`Error: ${message}`);
    }
    setActingOnId(null);
  };

  const handleAcknowledge = async (escalationId: string) => {
    setActingOnId(escalationId);
    const { success, message } = await acknowledgeEscalation(escalationId);
    if (success) {
      await loadEscalations();
    } else {
      alert(`Error: ${message}`);
    }
    setActingOnId(null);
  };

  const getEscalationColor = (level: number): string => {
    if (level >= 3) return 'red'; // Critical
    if (level === 2) return 'orange'; // High
    return 'yellow'; // Medium
  };

  const color = getEscalationColor(Math.max(...escalations.map((e) => e.escalation_level), 1));

  if (loading) {
    return (
      <div className="text-center py-4 text-gray-500">
        <Clock className="inline-block h-4 w-4 mr-2 animate-spin" />
        Loading escalations...
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-4 space-y-4 ${
      color === 'red'
        ? 'border-red-300 bg-red-50'
        : color === 'orange'
          ? 'border-orange-300 bg-orange-50'
          : 'border-yellow-300 bg-yellow-50'
    }`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          {color === 'red' && <AlertTriangle className="h-5 w-5 text-red-600" />}
          {color === 'orange' && <AlertCircle className="h-5 w-5 text-orange-600" />}
          {color === 'yellow' && <AlertCircle className="h-5 w-5 text-yellow-600" />}
          <span className={color === 'red' ? 'text-red-900' : color === 'orange' ? 'text-orange-900' : 'text-yellow-900'}>
            Task Escalations
          </span>
        </h3>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${
          color === 'red'
            ? 'bg-red-200 text-red-800'
            : color === 'orange'
              ? 'bg-orange-200 text-orange-800'
              : 'bg-yellow-200 text-yellow-800'
        }`}>
          {escalations.length} active
        </span>
      </div>

      {escalations.length === 0 ? (
        <div className="text-center py-6">
          <CheckCircle className="mx-auto h-8 w-8 text-green-500 mb-2" />
          <p className="text-gray-600 font-medium">All escalations resolved!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {escalations.map((escalation) => (
            <div
              key={escalation.id}
              className={`border rounded-lg overflow-hidden transition ${
                expandedEscalation === escalation.id
                  ? 'border-blue-500 shadow-md'
                  : `border-${color}-300 bg-white`
              }`}
            >
              {/* Header */}
              <button
                onClick={() =>
                  setExpandedEscalation(
                    expandedEscalation === escalation.id ? null : escalation.id
                  )
                }
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      escalation.escalation_level >= 3
                        ? 'bg-red-500'
                        : escalation.escalation_level === 2
                          ? 'bg-orange-500'
                          : 'bg-yellow-500'
                    }`}
                  />
                  <div className="text-left">
                    <div className="font-medium text-gray-900">
                      Level {escalation.escalation_level} Escalation
                    </div>
                    <div className="text-sm text-gray-500">
                      Task ID: {escalation.task_id.slice(0, 8)}...
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {formatDistanceToNow(new Date(escalation.escalated_at), { addSuffix: true })}
                  </span>
                  {expandedEscalation === escalation.id ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded Details */}
              {expandedEscalation === escalation.id && (
                <div className="border-t bg-gray-50 px-4 py-3 space-y-3">
                  {escalation.escalation_reason && (
                    <div>
                      <p className="text-sm font-medium text-gray-700">Reason:</p>
                      <p className="text-sm text-gray-600 mt-1">{escalation.escalation_reason}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">SLA Breached:</p>
                      <p className="font-medium text-gray-900">
                        {new Date(escalation.sla_breach_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Hours Overdue:</p>
                      <p className="font-medium text-red-600">
                        ~{Math.round((new Date().getTime() - new Date(escalation.sla_breach_at).getTime()) / (1000 * 60 * 60))}h
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleAcknowledge(escalation.id)}
                      disabled={actingOnId === escalation.id}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-md flex items-center justify-center gap-2 transition text-sm"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Acknowledge
                    </button>
                    <button
                      onClick={() => handleResolve(escalation.id)}
                      disabled={actingOnId === escalation.id}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-md flex items-center justify-center gap-2 transition text-sm"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Resolved
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
