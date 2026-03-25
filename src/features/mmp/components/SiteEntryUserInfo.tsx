/**
 * Component to display user information for site entry verification and completion
 * 
 * This component displays:
 * - Who verified the site entry (with user details)
 * - Who completed the site entry (with user details)
 * 
 * Usage:
 * ```tsx
 * <SiteEntryUserInfo 
 *   siteEntry={siteEntry}
 *   verifier={verifierProfile}
 *   completer={completerProfile}
 * />
 * ```
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, CheckCircle2, Clock } from 'lucide-react';

interface UserProfile {
  id: string;
  full_name?: string | null;
  email?: string | null;
  username?: string | null;
}

interface SiteEntryUserInfoProps {
  siteEntry: {
    id: string;
    verified_by_user_id?: string | null;
    verified_by?: string | null; // Fallback text field
    verified_at?: string | null;
    completed_by_user_id?: string | null;
    accepted_by?: string | null; // Fallback text field
    accepted_at?: string | null;
    status?: string;
  };
  verifier?: UserProfile | null;
  completer?: UserProfile | null;
  showTimestamps?: boolean;
  compact?: boolean;
}

export const SiteEntryUserInfo: React.FC<SiteEntryUserInfoProps> = ({
  siteEntry,
  verifier,
  completer,
  showTimestamps = true,
  compact = false
}) => {
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getUserDisplayName = (user: UserProfile | null | undefined, fallbackText?: string | null) => {
    if (user) {
      return user.full_name || user.username || user.email || 'Unknown User';
    }
    if (fallbackText) {
      return fallbackText;
    }
    return 'Not specified';
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-4 text-sm">
        {siteEntry.verified_by_user_id || siteEntry.verified_by ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="font-medium">Verified:</span>
            <span>{getUserDisplayName(verifier, siteEntry.verified_by)}</span>
            {showTimestamps && siteEntry.verified_at && (
              <span className="text-muted-foreground">
                ({formatDate(siteEntry.verified_at)})
              </span>
            )}
          </div>
        ) : null}
        
        {siteEntry.completed_by_user_id || siteEntry.accepted_by ? (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" />
            <span className="font-medium">Completed:</span>
            <span>{getUserDisplayName(completer, siteEntry.accepted_by)}</span>
            {showTimestamps && siteEntry.accepted_at && (
              <span className="text-muted-foreground">
                ({formatDate(siteEntry.accepted_at)})
              </span>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Verifier Information */}
      {siteEntry.verified_by_user_id || siteEntry.verified_by ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Verified By
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm font-medium">
                {getUserDisplayName(verifier, siteEntry.verified_by)}
              </p>
              {verifier?.email && (
                <p className="text-xs text-muted-foreground">{verifier.email}</p>
              )}
              {verifier?.username && verifier.username !== verifier.email && (
                <p className="text-xs text-muted-foreground">@{verifier.username}</p>
              )}
            </div>
            {showTimestamps && siteEntry.verified_at && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatDate(siteEntry.verified_at)}</span>
              </div>
            )}
            {!verifier && siteEntry.verified_by && (
              <Badge variant="outline" className="text-xs">
                Legacy text field
              </Badge>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Completer Information */}
      {siteEntry.completed_by_user_id || siteEntry.accepted_by ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              Completed By
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm font-medium">
                {getUserDisplayName(completer, siteEntry.accepted_by)}
              </p>
              {completer?.email && (
                <p className="text-xs text-muted-foreground">{completer.email}</p>
              )}
              {completer?.username && completer.username !== completer.email && (
                <p className="text-xs text-muted-foreground">@{completer.username}</p>
              )}
            </div>
            {showTimestamps && siteEntry.accepted_at && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatDate(siteEntry.accepted_at)}</span>
              </div>
            )}
            {!completer && siteEntry.accepted_by && (
              <Badge variant="outline" className="text-xs">
                Legacy text field
              </Badge>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Show message if neither is set */}
      {!siteEntry.verified_by_user_id && !siteEntry.verified_by && 
       !siteEntry.completed_by_user_id && !siteEntry.accepted_by && (
        <div className="col-span-2 text-sm text-muted-foreground text-center py-4">
          No verification or completion information available
        </div>
      )}
    </div>
  );
};

export default SiteEntryUserInfo;

