/**
 * NotificationDeliveryStatus Component
 * Displays delivery status of task notifications across channels
 */

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Mail,
  MessageSquare,
  Smartphone,
  Check,
  AlertCircle,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from 'lucide-react';
import * as DeliveryService from '@/services/notification-delivery.service';
import type { DeliveryLog, DeliverySummary } from '@/services/notification-delivery.service';

interface NotificationDeliveryStatusProps {
  notificationId: string;
  taskId?: string;
  className?: string;
  compact?: boolean;
}

const CHANNEL_CONFIG = {
  email: {
    icon: Mail,
    label: 'Email',
    colors: {
      delivered: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
      pending: 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20',
      failed: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
      read: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
    },
  },
  whatsapp: {
    icon: MessageSquare,
    label: 'WhatsApp',
    colors: {
      delivered: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
      pending: 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20',
      failed: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
      read: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20',
    },
  },
  push: {
    icon: Smartphone,
    label: 'Mobile Push',
    colors: {
      delivered: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20',
      pending: 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20',
      failed: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
      read: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
    },
  },
  in_app: {
    icon: Eye,
    label: 'In-App',
    colors: {
      delivered: 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20',
      pending: 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20',
      failed: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
      read: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20',
    },
  },
};

const STATUS_ICONS = {
  delivered: Check,
  pending: Clock,
  failed: AlertCircle,
  read: Eye,
  bounced: AlertCircle,
};

export function NotificationDeliveryStatus({
  notificationId,
  taskId,
  className = '',
  compact = false,
}: NotificationDeliveryStatusProps) {
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);
  const [summary, setSummary] = useState<DeliverySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!compact);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDeliveryStatus() {
      setLoading(true);
      setError(null);
      try {
        const [logs, deliverySummary] = await Promise.all([
          DeliveryService.getDeliveryLogs(notificationId),
          DeliveryService.getDeliverySummary(notificationId),
        ]);

        setDeliveryLogs(logs);
        setSummary(deliverySummary);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load delivery status');
      } finally {
        setLoading(false);
      }
    }

    loadDeliveryStatus();
  }, [notificationId]);

  if (loading) {
    return (
      <div className={`p-3 bg-slate-50 dark:bg-slate-900 rounded-lg animate-pulse ${className}`}>
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg ${className}`}>
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (deliveryLogs.length === 0) {
    return (
      <div className={`p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-center ${className}`}>
        <p className="text-xs text-muted-foreground">No delivery attempts recorded</p>
      </div>
    );
  }

  // Group by channel
  const byChannel = deliveryLogs.reduce(
    (acc, log) => {
      if (!acc[log.channel]) {
        acc[log.channel] = [];
      }
      acc[log.channel].push(log);
      return acc;
    },
    {} as Record<string, DeliveryLog[]>
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Summary Cards */}
      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['email', 'whatsapp', 'push', 'in_app'] as const).map(channel => {
            const config = CHANNEL_CONFIG[channel];
            const ChannelIcon = config.icon;
            const logs = byChannel[channel] || [];
            const delivered = logs.filter(l => l.status === 'delivered').length;
            const failed = logs.filter(l => l.status === 'failed').length;

            return (
              <div
                key={channel}
                className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <div className="flex items-center gap-1 mb-1">
                  <ChannelIcon className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">
                    {delivered}
                  </span>
                  <span className="text-xs text-muted-foreground">/{logs.length}</span>
                  {failed > 0 && (
                    <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                      ({failed} failed)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expand/Collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-sm font-medium"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Delivery Details
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Detailed Logs */}
      {expanded && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {deliveryLogs.map((log, idx) => {
            const config = CHANNEL_CONFIG[log.channel as keyof typeof CHANNEL_CONFIG];
            const ChannelIcon = config?.icon || Mail;
            const StatusIcon = STATUS_ICONS[log.status as keyof typeof STATUS_ICONS] || AlertCircle;
            const colorClass = config?.colors[log.status as keyof typeof config.colors] || config?.colors.pending;

            return (
              <div
                key={log.id}
                className={`p-3 border border-slate-200 dark:border-slate-700 rounded-lg ${colorClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <ChannelIcon className="w-4 h-4" />
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{config?.label}</span>
                        <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs uppercase font-bold">
                          {log.status}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="font-medium text-slate-700 dark:text-slate-300">Sent:</div>
                        <div>
                          {format(new Date(log.created_at), 'MMM dd HH:mm')}
                        </div>
                      </div>

                      {log.delivery_timestamp && (
                        <div>
                          <div className="font-medium text-slate-700 dark:text-slate-300">Delivered:</div>
                          <div>
                            {format(new Date(log.delivery_timestamp), 'MMM dd HH:mm')}
                          </div>
                        </div>
                      )}

                      {log.read_timestamp && (
                        <div>
                          <div className="font-medium text-slate-700 dark:text-slate-300">Read:</div>
                          <div>
                            {format(new Date(log.read_timestamp), 'MMM dd HH:mm')}
                          </div>
                        </div>
                      )}

                      {log.provider && (
                        <div>
                          <div className="font-medium text-slate-700 dark:text-slate-300">Provider:</div>
                          <div className="font-mono">{log.provider}</div>
                        </div>
                      )}

                      {log.attempt_count > 1 && (
                        <div>
                          <div className="font-medium text-slate-700 dark:text-slate-300">Attempts:</div>
                          <div>{log.attempt_count}</div>
                        </div>
                      )}
                    </div>

                    {log.error_message && (
                      <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-900 rounded text-xs font-mono">
                        <div className="font-medium text-slate-700 dark:text-slate-300">Error:</div>
                        <div className="text-red-600 dark:text-red-400 mt-1">
                          {log.error_message.substring(0, 150)}
                          {log.error_message.length > 150 ? '...' : ''}
                        </div>
                      </div>
                    )}

                    {log.provider_reference_id && (
                      <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                        ID: {log.provider_reference_id.substring(0, 30)}...
                      </div>
                    )}
                  </div>

                  <StatusIcon className="w-5 h-5 flex-shrink-0 mt-1" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationDeliveryStatus;
