import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  History, 
  FileText, 
  DollarSign, 
  CheckCircle2, 
  Clock,
  PenLine,
  Shield,
  Mail,
  Phone,
  Fingerprint,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import { SignatureVerificationBadge } from './SignatureVerificationBadge';
import type { DocumentSignature, TransactionSignature, SignatureMethod } from '@/types/signature';
import { cn } from '@/lib/utils';

interface SignatureHistoryItem {
  id: string;
  type: 'transaction' | 'document';
  title: string;
  description?: string;
  signatureMethod: SignatureMethod;
  status: 'pending' | 'signed' | 'verified' | 'expired' | 'revoked' | 'invalid';
  signedAt?: string;
  verifiedAt?: string;
  amount?: number;
  currency?: string;
  signerName?: string;
  documentType?: string;
}

interface SignatureHistoryProps {
  signatures: SignatureHistoryItem[];
  isLoading?: boolean;
  title?: string;
  description?: string;
  maxHeight?: string;
  showViewAll?: boolean;
  onViewAll?: () => void;
  onViewSignature?: (id: string) => void;
  className?: string;
}

const methodIcons: Record<SignatureMethod, React.ElementType> = {
  uuid: Shield,
  phone: Phone,
  email: Mail,
  handwriting: PenLine,
  biometric: Fingerprint,
};

const methodLabels: Record<SignatureMethod, string> = {
  uuid: 'Quick Sign',
  phone: 'Phone OTP',
  email: 'Email OTP',
  handwriting: 'Handwriting',
  biometric: 'Biometric',
};

function SignatureHistoryItemCard({ 
  signature, 
  onView,
  expanded,
  onToggle 
}: { 
  signature: SignatureHistoryItem;
  onView?: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const MethodIcon = methodIcons[signature.signatureMethod];
  const isMonetary = signature.type === 'transaction' && signature.amount;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
    }).format(amount) + ' ' + currency;
  };

  return (
    <div 
      className={cn(
        'p-3 rounded-lg border bg-card transition-colors',
        expanded && 'border-primary/30 bg-primary/5'
      )}
    >
      <div 
        className="flex items-start justify-between gap-3 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn(
            'p-2 rounded-lg shrink-0',
            signature.status === 'verified' 
              ? 'bg-green-100 dark:bg-green-900/30' 
              : signature.status === 'signed'
                ? 'bg-blue-100 dark:bg-blue-900/30'
                : 'bg-muted'
          )}>
            {isMonetary ? (
              <DollarSign className={cn(
                'h-4 w-4',
                signature.status === 'verified' 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-blue-600 dark:text-blue-400'
              )} />
            ) : (
              <FileText className={cn(
                'h-4 w-4',
                signature.status === 'verified' 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-blue-600 dark:text-blue-400'
              )} />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{signature.title}</span>
              <SignatureVerificationBadge 
                status={signature.status} 
                method={signature.signatureMethod}
                size="sm"
              />
            </div>
            
            {isMonetary && signature.amount && signature.currency && (
              <div className="text-sm font-semibold text-green-600 dark:text-green-400 mt-0.5">
                {formatAmount(signature.amount, signature.currency)}
              </div>
            )}
            
            {signature.signedAt && (
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(signature.signedAt)}
              </div>
            )}
          </div>
        </div>

        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          {signature.description && (
            <p className="text-sm text-muted-foreground">{signature.description}</p>
          )}
          
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <MethodIcon className="h-4 w-4 text-muted-foreground" />
              <span>{methodLabels[signature.signatureMethod]}</span>
            </div>
            
            {signature.signerName && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">By:</span>
                <span className="font-medium">{signature.signerName}</span>
              </div>
            )}

            {signature.documentType && (
              <Badge variant="outline" className="text-xs">
                {signature.documentType.replace('_', ' ')}
              </Badge>
            )}
          </div>

          {signature.verifiedAt && (
            <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Verified: {formatDate(signature.verifiedAt)}
            </div>
          )}

          {onView && (
            <div className="pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onView(signature.id)}
                className="gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                View Details
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SignatureHistory({
  signatures,
  isLoading = false,
  title = 'Signature History',
  description = 'Your recent digital signatures',
  maxHeight = '400px',
  showViewAll = false,
  onViewAll,
  onViewSignature,
  className,
}: SignatureHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {showViewAll && onViewAll && signatures.length > 0 && (
            <Button variant="outline" size="sm" onClick={onViewAll}>
              View All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {signatures.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <PenLine className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No signatures yet</p>
            <p className="text-sm">Your signed documents will appear here</p>
          </div>
        ) : (
          <ScrollArea style={{ maxHeight }} className="pr-4">
            <div className="space-y-3">
              {signatures.map((signature) => (
                <SignatureHistoryItemCard
                  key={signature.id}
                  signature={signature}
                  onView={onViewSignature}
                  expanded={expandedId === signature.id}
                  onToggle={() => toggleExpanded(signature.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default SignatureHistory;