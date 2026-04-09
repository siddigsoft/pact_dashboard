import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, QrCode, X, Download, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface MobileAppDownloadCardProps {
  userId: string;
  userRole: string;
  compact?: boolean;
}

const FIELD_ROLES = ['datacollector', 'coordinator', 'dataCollector'];

const isFieldRole = (role: string): boolean => {
  const norm = role.toLowerCase().replace(/[\s_-]/g, '');
  return norm.includes('datacollector') || norm.includes('coordinator');
};

const QR_PLACEHOLDER = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><rect width="180" height="180" fill="white"/><rect x="10" y="10" width="60" height="60" fill="none" stroke="%23333" stroke-width="6"/><rect x="20" y="20" width="40" height="40" fill="%23333"/><rect x="110" y="10" width="60" height="60" fill="none" stroke="%23333" stroke-width="6"/><rect x="120" y="20" width="40" height="40" fill="%23333"/><rect x="10" y="110" width="60" height="60" fill="none" stroke="%23333" stroke-width="6"/><rect x="20" y="120" width="40" height="40" fill="%23333"/><rect x="80" y="80" width="20" height="20" fill="%23333"/><rect x="110" y="80" width="20" height="20" fill="%23333"/><rect x="140" y="80" width="20" height="20" fill="%23333"/><rect x="80" y="110" width="20" height="20" fill="%23333"/><rect x="110" y="110" width="20" height="20" fill="%23333"/><rect x="140" y="140" width="20" height="20" fill="%23333"/><rect x="80" y="140" width="20" height="20" fill="%23333"/></svg>`;

export const MobileAppDownloadCard = ({ userId, userRole, compact = false }: MobileAppDownloadCardProps) => {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(`mobile_app_card_dismissed_${userId}`) === 'true';
  });
  const [showQrDialog, setShowQrDialog] = useState(false);

  if (!isFieldRole(userRole) || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(`mobile_app_card_dismissed_${userId}`, 'true');
    setDismissed(true);
  };

  if (compact) {
    return (
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800" data-testid="card-mobile-app-download">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">Get the PACT Mobile App</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">Collect data offline, anywhere</p>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-blue-300" onClick={() => setShowQrDialog(true)} data-testid="button-show-qr">
                <QrCode className="h-3.5 w-3.5 mr-1" /> QR Code
              </Button>
              <button onClick={handleDismiss} className="text-blue-400 hover:text-blue-600 ml-1" data-testid="button-dismiss-app-card">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardContent>

        <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
          <DialogContent className="max-w-sm text-center" data-testid="dialog-qr-code">
            <DialogHeader>
              <DialogTitle>Download PACT Mobile App</DialogTitle>
              <DialogDescription>Scan the QR code to install the app on your Android device</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <img src={QR_PLACEHOLDER} alt="QR Code" className="h-44 w-44 rounded-lg border" />
            </div>
            <div className="flex items-center justify-center gap-1 mb-2">
              {[1,2,3,4,5].map(s => <Star key={s} className="h-4 w-4 text-amber-400 fill-amber-400" />)}
              <span className="text-xs text-muted-foreground ml-1">4.8 · Field Ops Tool</span>
            </div>
            <Button className="w-full gap-2" data-testid="button-download-app">
              <Download className="h-4 w-4" /> Download APK
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Available for Android 8.0+. Requires PACT credentials to sign in.</p>
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 dark:border-blue-800 relative overflow-hidden" data-testid="card-mobile-app-download-full">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-blue-400 hover:text-blue-600 z-10"
        data-testid="button-dismiss-app-card-full"
      >
        <X className="h-4 w-4" />
      </button>

      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1 space-y-3">
            <Badge className="bg-blue-600 text-white hover:bg-blue-700 gap-1.5 text-xs">
              <Smartphone className="h-3 w-3" /> Mobile App
            </Badge>
            <h3 className="text-xl font-bold text-blue-900 dark:text-blue-100">Take PACT into the Field</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              The PACT mobile app lets you collect data, submit costs, and view your sites — even offline. Perfect for field operations.
            </p>
            <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
              <li className="flex items-center gap-1.5">✓ Works offline in remote areas</li>
              <li className="flex items-center gap-1.5">✓ Real-time sync when connected</li>
              <li className="flex items-center gap-1.5">✓ GPS-enabled site check-ins</li>
              <li className="flex items-center gap-1.5">✓ Photo capture for site verification</li>
            </ul>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => setShowQrDialog(true)} data-testid="button-show-qr-full">
              <QrCode className="h-4 w-4" /> Scan QR to Download
            </Button>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-32 w-32 rounded-xl border-2 border-blue-200 bg-white flex items-center justify-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowQrDialog(true)}>
              <img src={QR_PLACEHOLDER} alt="QR Code" className="h-28 w-28 rounded" />
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Scan to install</p>
          </div>
        </div>
      </CardContent>

      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Download PACT Mobile App</DialogTitle>
            <DialogDescription>Scan the QR code with your Android device camera</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <img src={QR_PLACEHOLDER} alt="QR Code" className="h-48 w-48 rounded-lg border" />
          </div>
          <div className="flex items-center justify-center gap-1 mb-2">
            {[1,2,3,4,5].map(s => <Star key={s} className="h-4 w-4 text-amber-400 fill-amber-400" />)}
            <span className="text-xs text-muted-foreground ml-1">4.8 rating · PACT Field Ops</span>
          </div>
          <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700" data-testid="button-download-app-full">
            <Download className="h-4 w-4" /> Download APK Directly
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Android 8.0+. Sign in with your PACT credentials.</p>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
