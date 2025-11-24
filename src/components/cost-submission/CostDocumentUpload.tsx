import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SupportingDocument } from "@/types/cost-submission";
import { supabase } from "@/integrations/supabase/client";
import { Upload, File, X, Loader2, FileText, Image as ImageIcon } from "lucide-react";

interface CostDocumentUploadProps {
  documents: SupportingDocument[];
  onChange: (documents: SupportingDocument[]) => void;
}

const CostDocumentUpload = ({ documents, onChange }: CostDocumentUploadProps) => {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      const uploadedDocs: SupportingDocument[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const filePath = `cost-receipts/${fileName}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('uploads')
          .upload(filePath, file);

        if (error) {
          console.error('Upload error:', error);
          throw new Error(`Failed to upload ${file.name}`);
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('uploads')
          .getPublicUrl(filePath);

        // Determine file type
        const isImage = file.type.startsWith('image/');
        const isPDF = file.type === 'application/pdf';
        const documentType = isImage ? 'receipt_photo' : isPDF ? 'receipt_pdf' : 'other';

        uploadedDocs.push({
          url: publicUrlData.publicUrl,
          type: documentType,
          filename: file.name,
          uploadedAt: new Date().toISOString(),
          size: file.size,
          description: ''
        });
      }

      // Add new documents to existing ones
      onChange([...documents, ...uploadedDocs]);

      toast({
        title: "Success",
        description: `${uploadedDocs.length} document(s) uploaded successfully`
      });

      // Reset file input
      event.target.value = '';
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload documents",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveDocument = (index: number) => {
    const newDocs = documents.filter((_, i) => i !== index);
    onChange(newDocs);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (doc: SupportingDocument) => {
    if (doc.type === 'receipt_photo') return <ImageIcon className="h-5 w-5 text-blue-600" />;
    if (doc.type === 'receipt_pdf') return <FileText className="h-5 w-5 text-red-600" />;
    return <File className="h-5 w-5 text-gray-600" />;
  };

  return (
    <div className="space-y-4">
      {/* Upload Button */}
      <div>
        <input
          id="document-upload"
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
          data-testid="input-file-upload"
        />
        <label htmlFor="document-upload">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isUploading}
            asChild
            data-testid="button-upload-document"
          >
            <span className="cursor-pointer">
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Documents
                </>
              )}
            </span>
          </Button>
        </label>
        <p className="text-xs text-muted-foreground mt-2">
          Supported formats: Images (JPG, PNG) and PDF. Max 5MB per file.
        </p>
      </div>

      {/* Uploaded Documents List */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Uploaded Documents ({documents.length})</p>
          <div className="space-y-2">
            {documents.map((doc, index) => (
              <Card key={index} data-testid={`document-${index}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getFileIcon(doc)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.filename}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {doc.type.replace('_', ' ')}
                          </Badge>
                          {doc.size && (
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(doc.size)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(doc.url, '_blank')}
                        data-testid={`button-view-${index}`}
                      >
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveDocument(index)}
                        data-testid={`button-remove-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CostDocumentUpload;
