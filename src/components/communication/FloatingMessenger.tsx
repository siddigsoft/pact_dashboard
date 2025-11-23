
import React, { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { MessageSquare, Phone, Minus, Maximize2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommunicationPanel from './CommunicationPanel';
import { useCommunication } from '@/context/communications/CommunicationContext';
import CallInterface from './CallInterface';

const FloatingMessenger = () => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { callState, endCall } = useCommunication();
  
  const isCallActive = callState.status !== 'idle';

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          <Button
            onClick={() => setIsOpen(true)}
            className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90 transition-all"
          >
            <MessageSquare className="h-6 w-6" />
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2"
            >
              3
            </Badge>
          </Button>
        </div>
      )}

      {/* Communication Sheet */}
      <Sheet 
        open={isOpen} 
        onOpenChange={(open) => {
          if (!open && isCallActive) endCall();
          setIsOpen(open);
        }}
      >
        <SheetContent 
          side="right" 
          className={`w-[380px] p-0 ${isMinimized ? 'h-[70px]' : 'h-[600px]'}`}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <div className="flex items-center gap-2">
                {isCallActive ? (
                  <Phone className="h-5 w-5 text-primary animate-pulse" />
                ) : (
                  <MessageSquare className="h-5 w-5" />
                )}
                <span className="font-medium">
                  {isCallActive ? 'Active Call' : 'Messages'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setIsMinimized(!isMinimized)}
                >
                  {isMinimized ? (
                    <Maximize2 className="h-4 w-4" />
                  ) : (
                    <Minus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Content */}
            {!isMinimized && (
              <div className="flex-1 overflow-hidden">
                {isCallActive && callState.recipient ? (
                  <CallInterface
                    recipient={callState.recipient}
                    callType={callState.status}
                    duration={callState.duration}
                    onEnd={endCall}
                    minimized={false}
                  />
                ) : (
                  <CommunicationPanel />
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default FloatingMessenger;
