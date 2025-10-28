
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/FileUpload';
import { MMPStatePermitDocument } from '@/types/mmp/permits';
import { useToast } from '@/hooks/use-toast';
import { Upload, Building2, Landmark, MapPin } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sudanStates } from '@/data/sudanStates';
import { format } from 'date-fns';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MMPPermitFileUploadProps {
  onUploadSuccess: (document: MMPStatePermitDocument) => void;
  bucket?: string;
  pathPrefix?: string;
}

const permitTypes = [
  {
    id: 'federal',
    name: 'Federal Permit',
    description: 'National level authorization',
    icon: Landmark,
  },
  {
    id: 'state',
    name: 'State Permit',
    description: 'State level authorization',
    icon: Building2,
  },
  {
    id: 'local',
    name: 'Local Permit',
    description: 'Local municipality authorization',
    icon: MapPin,
  },
];

export const MMPPermitFileUpload: React.FC<MMPPermitFileUploadProps> = ({ onUploadSuccess, bucket = 'mmp-files', pathPrefix }) => {
  const [uploading, setUploading] = useState(false);
  const [issueDate, setIssueDate] = useState<Date>();
  const [expiryDate, setExpiryDate] = useState<Date>();
  const [comments, setComments] = useState('');
  const [permitType, setPermitType] = useState<'federal' | 'state' | 'local'>('federal');
  const [state, setState] = useState('');
  const [locality, setLocality] = useState('');
  const { toast } = useToast();

  const handleUploadSuccess = (fileUrl: string, fileName: string) => {
    const currentDate = new Date();
    const formattedDate = format(currentDate, 'yyyyMMdd-HHmmss');
    const documentType = permitType === 'federal' ? 'FED' : permitType === 'state' ? 'STATE' : 'LOCAL';
    const stateCode = permitType === 'state' && state ? `-${state}` : '';
    const localityCode = permitType === 'local' && locality ? `-${locality}` : '';
    const documentId = `${documentType}${stateCode}${localityCode}-${formattedDate}`;

    const newDocument: MMPStatePermitDocument = {
      id: documentId,
      fileName,
      fileUrl,
      uploadedAt: currentDate.toISOString(),
      validated: false,
      issueDate: issueDate?.toISOString(),
      expiryDate: expiryDate?.toISOString(),
      comments: comments.trim() || undefined,
      permitType,
      ...(permitType === 'state' && { state: state.trim() }),
      ...(permitType === 'local' && { locality: locality.trim() }),
    };

    onUploadSuccess(newDocument);
    
    // Reset form
    setIssueDate(undefined);
    setExpiryDate(undefined);
    setComments('');
    setState('');
    setLocality('');
    
    toast({
      title: 'File Uploaded',
      description: `Successfully uploaded ${fileName} with ID: ${documentId}`
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Permit Type</Label>
          <RadioGroup
            value={permitType}
            onValueChange={(value: 'federal' | 'state' | 'local') => setPermitType(value)}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {permitTypes.map((type) => {
              const Icon = type.icon;
              return (
                <Label
                  key={type.id}
                  className={cn(
                    "cursor-pointer",
                    "transition-all hover:scale-105"
                  )}
                  htmlFor={type.id}
                >
                  <Card className={cn(
                    "relative p-4 h-full",
                    "hover:border-primary",
                    permitType === type.id && "border-primary bg-primary/5"
                  )}>
                    <RadioGroupItem
                      value={type.id}
                      id={type.id}
                      className="sr-only"
                    />
                    <div className="flex flex-col items-center text-center space-y-2 md:space-y-4">
                      <Icon className="h-8 w-8 md:h-12 md:w-12" />
                      <div>
                        <h3 className="font-medium">{type.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {type.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Label>
              );
            })}
          </RadioGroup>
        </div>

        {permitType === 'state' && (
          <div className="space-y-2">
            <Label>State</Label>
            <Select
              value={state}
              onValueChange={setState}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a state" />
              </SelectTrigger>
              <SelectContent>
                {sudanStates.map((sudanState) => (
                  <SelectItem key={sudanState.id} value={sudanState.id}>
                    {sudanState.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {permitType === 'local' && (
          <div className="space-y-2">
            <Label>Locality/Municipality</Label>
            <input
              type="text"
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder="Enter locality or municipality name"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Issue Date</Label>
            <DatePicker date={issueDate} onSelect={setIssueDate} />
          </div>
          <div className="space-y-2">
            <Label>Expiry Date</Label>
            <DatePicker date={expiryDate} onSelect={setExpiryDate} />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label>Comments</Label>
          <Textarea 
            placeholder="Add any comments about this permit..."
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </div>

        <FileUpload
          bucket={bucket}
          pathPrefix={[
            pathPrefix,
            permitType,
            permitType === 'state' && state ? state : undefined,
            permitType === 'local' && locality ? locality : undefined,
          ]
            .filter(Boolean)
            .join('/')}
          onUploadSuccess={(fileUrl: string, fileName: string) => handleUploadSuccess(fileUrl, fileName)}
        />
      </div>
    </div>
  );
};
