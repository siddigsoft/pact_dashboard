import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone, Video, Wifi, Globe, Zap, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CallMethod = 'webrtc' | 'jitsi';
export type CallType = 'audio' | 'video';

interface CallMethodDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (method: CallMethod, callType: CallType) => void;
  recipientName: string;
}

export function CallMethodDialog({ isOpen, onClose, onSelect, recipientName }: CallMethodDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<CallMethod | null>(null);

  const handleSelect = (callType: CallType) => {
    if (selectedMethod) {
      onSelect(selectedMethod, callType);
      onClose();
      setSelectedMethod(null);
    }
  };

  const handleClose = () => {
    onClose();
    setSelectedMethod(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Call {recipientName}</DialogTitle>
          <DialogDescription className="text-center">
            Choose your preferred calling method
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Method Selection */}
          <div className="grid grid-cols-2 gap-3">
            {/* WebRTC Option */}
            <button
              onClick={() => setSelectedMethod('webrtc')}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                selectedMethod === 'webrtc'
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
              )}
              data-testid="button-method-webrtc"
            >
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                selectedMethod === 'webrtc' ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800"
              )}>
                <Zap className="h-6 w-6" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-sm">Direct Call</h3>
                <p className="text-xs text-muted-foreground">Peer-to-peer</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wifi className="h-3 w-3" />
                <span>Low latency</span>
              </div>
            </button>

            {/* Jitsi Option */}
            <button
              onClick={() => setSelectedMethod('jitsi')}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                selectedMethod === 'jitsi'
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
              )}
              data-testid="button-method-jitsi"
            >
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                selectedMethod === 'jitsi' ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-800"
              )}>
                <Globe className="h-6 w-6" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-sm">Jitsi Meet</h3>
                <p className="text-xs text-muted-foreground">More reliable</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                <span>Works anywhere</span>
              </div>
            </button>
          </div>

          {/* Method Info */}
          {selectedMethod && (
            <div className={cn(
              "p-3 rounded-lg text-sm",
              selectedMethod === 'webrtc' 
                ? "bg-primary/10 text-primary" 
                : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
            )}>
              {selectedMethod === 'webrtc' ? (
                <p>Direct peer-to-peer connection. Fastest option but may have issues with some networks or firewalls.</p>
              ) : (
                <p>Uses Jitsi Meet servers. More reliable across different networks and firewalls. Recommended if direct calls don't connect.</p>
              )}
            </div>
          )}

          {/* Call Type Buttons */}
          {selectedMethod && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                onClick={() => handleSelect('audio')}
                variant="outline"
                className="h-12 gap-2"
                data-testid="button-call-audio"
              >
                <Phone className="h-5 w-5" />
                Voice Call
              </Button>
              <Button
                onClick={() => handleSelect('video')}
                className="h-12 gap-2"
                data-testid="button-call-video"
              >
                <Video className="h-5 w-5" />
                Video Call
              </Button>
            </div>
          )}

          {!selectedMethod && (
            <p className="text-center text-sm text-muted-foreground">
              Select a calling method above to continue
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
