import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { safeUploadFile } from '@/lib/safeUpload';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle2, X, Eye, EyeOff, Landmark, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { sudanStates } from '@/data/sudanStates';
import { useAuthorization } from '@/hooks/use-authorization';
import { MMPStatePermitDocument } from '@/types/mmp/permits';

interface MMPPermitFileUploadProps {
  onUploadSuccess: (document: MMPStatePermitDocument) => void;
  bucket?: string;
  pathPrefix?: string;
}

const permitTypes = [
  { id: 'federal', name: 'Federal Permit', description: 'National level authorization', icon: Landmark },
  // Extend later for state/local permits
];

export const MMPPermitFileUpload: React.FC<MMPPermitFileUploadProps> = ({ onUploadSuccess, bucket = 'mmp-files', pathPrefix }) => {
  const [uploading, setUploading] = useState(false);
  const [issueDate, setIssueDate] = useState<Date>();
  const [expiryDate, setExpiryDate] = useState<Date>();
  const [comments, setComments] = useState('');
  const [permitType, setPermitType] = useState<'federal' | 'state' | 'local'>('federal');
  const [state, setState] = useState('');
  const [locality, setLocality] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();

  const isFOM = hasAnyRole(['fom', 'fieldOpManager']);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please select a PDF or image file (JPG, PNG).", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select a file smaller than 10MB.", variant: "destructive" });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setShowPreview(true);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setShowPreview(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const togglePreview = () => setShowPreview(!showPreview);

  const handleUploadSuccessInternal = (fileUrl: string, fileName: string) => {
    const now = new Date();
    const formattedDate = format(now, 'yyyyMMdd-HHmmss');
    const docType = permitType === 'federal' ? 'FED' : permitType === 'state' ? 'STATE' : 'LOCAL';
    const stateCode = permitType === 'state' && state ? `-${state}` : '';
    const localityCode = permitType === 'local' && locality ? `-${locality}` : '';
    const documentId = `${docType}${stateCode}${localityCode}-${formattedDate}`;

    const newDoc: MMPStatePermitDocument = {
      id: documentId,
      fileName,
      fileUrl,
      uploadedAt: now.toISOString(),
      validated: false,
      issueDate: issueDate?.toISOString(),
      expiryDate: expiryDate?.toISOString(),
      comments: comments.trim() || undefined,
      permitType,
      ...(permitType === 'state' && { state: state.trim() }),
      ...(permitType === 'local' && { locality: locality.trim() }),
    };

    onUploadSuccess(newDoc);

    // Reset form
    setIssueDate(undefined);
    setExpiryDate(undefined);
    setComments('');
    setState('');
    setLocality('');
    clearFile();

    toast({ title: 'File Uploaded', description: `Successfully uploaded ${fileName} with ID: ${documentId}` });
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      // 🔐 Force session check
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("Session expired. Please log in again.");

      const filePath = `${pathPrefix || 'permits'}/federal`;
      const uploadResult = await safeUploadFile(selectedFile, {
        bucket,
        path: filePath,
        allowedTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'],
        maxSizeBytes: 10 * 1024 * 1024
      });
      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || 'Failed to upload file');
      }
      handleUploadSuccessInternal(uploadResult.url, selectedFile.name);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast({ title: "Upload failed", description: err.message || "An error occurred while uploading the permit.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Permit Type Selection */}
        <Label>Permit Type</Label>
        <RadioGroup value={permitType} onValueChange={(v) => setPermitType(v as 'federal' | 'state' | 'local')} className="grid grid-cols-1 gap-4">
          {permitTypes.map((type) => {
            const Icon = type.icon;
            return (
              <Label key={type.id} className="cursor-pointer transition-all hover:scale-105" htmlFor={type.id}>
                <Card className={cn("relative p-4 h-full hover:border-primary", permitType === type.id && "border-primary bg-primary/5")}>
                  <RadioGroupItem value={type.id} id={type.id} className="sr-only" />
                  <div className="flex flex-col items-center text-center space-y-2 md:space-y-4">
                    <Icon className="h-8 w-8 md:h-12 md:w-12" />
                    <div>
                      <h3 className="font-medium">{type.name}</h3>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                    </div>
                  </div>
                </Card>
              </Label>
            );
          })}
        </RadioGroup>

        {/* Conditional State/Locality */}
        {permitType === 'state' && (
          <div className="space-y-2">
            <Label>State</Label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger><SelectValue placeholder="Select a state" /></SelectTrigger>
              <SelectContent>
                {sudanStates.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {permitType === 'local' && (
          <div className="space-y-2">
            <Label>Locality/Municipality</Label>
            <input type="text" value={locality} onChange={e => setLocality(e.target.value)} placeholder="Enter locality" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
          </div>
        )}

        {/* Dates & Comments */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Issue Date</Label><DatePicker date={issueDate} onSelect={setIssueDate} /></div>
          <div className="space-y-2"><Label>Expiry Date</Label><DatePicker date={expiryDate} onSelect={setExpiryDate} /></div>
        </div>
        <div className="space-y-2"><Label>Comments</Label><Textarea placeholder="Add comments..." value={comments} onChange={e => setComments(e.target.value)} /></div>

        {/* Preview Section */}
        {isFOM && selectedFile && previewUrl && (
          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-foreground">Preview</h4>
              <Button variant="ghost" size="sm" onClick={togglePreview}>
                {showPreview ? <><EyeOff className="h-4 w-4 mr-1" />Hide Preview</> : <><Eye className="h-4 w-4 mr-1" />Show Preview</>}
              </Button>
            </div>
            {showPreview && (
              <div className="border border-border rounded-lg overflow-hidden bg-muted">
                {selectedFile.type === 'application/pdf' ? <iframe src={previewUrl} className="w-full h-96 border-0" title="PDF Preview" /> :
                  <img src={previewUrl} alt="Permit Preview" className="w-full h-auto max-h-96 object-contain" />}
              </div>
            )}
          </div>
        )}

        {/* File Select & Upload */}
        {!selectedFile ? (
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/30">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">Click to select your federal permit file</p>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileSelect} className="hidden" />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}><FileText className="h-4 w-4 mr-2" />Select File</Button>
          </div>
        ) : (
          <div className="border border-border bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-foreground" />
                <div><p className="font-medium text-foreground">{selectedFile.name}</p><p className="text-sm text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p></div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFile}><X className="h-4 w-4" /></Button>
            </div>
            <Button onClick={handleUpload} className="w-full mt-4" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload Permit'}</Button>
          </div>
        )}
      </div>
    </div>
  );
};
