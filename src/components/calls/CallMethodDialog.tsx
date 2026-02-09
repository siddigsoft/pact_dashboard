import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone, Video } from 'lucide-react';

export type CallType = 'audio' | 'video';

interface CallMethodDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (callType: CallType) => void;
  recipientName: string;
}

export function CallMethodDialog({ isOpen, onClose, onSelect, recipientName }: CallMethodDialogProps) {
  const handleSelect = (callType: CallType) => {
    onSelect(callType);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Call {recipientName}</DialogTitle>
          <DialogDescription className="text-center">
            Choose your call type
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
