import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuditLog } from "@/hooks/use-audit-log";
import { SupportingDocument } from "@/types/cost-submission";
import { TransferReceiptDetails } from "@/types/receipt-details";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/context/user/UserContext";
import { ReceiptDetailsDialog } from "./ReceiptDetailsDialog";
import { 
  Upload, 
  File, 
  X, 
  Loader2, 
  FileText, 
  Image as ImageIcon, 
  Receipt,
  CheckCircle,
  Edit2 
} from "lucide-react";

interface ExtendedSupportingDocument extends SupportingDocument {
  receiptDetails?: TransferReceiptDetails;
}

interface CostDocumentUploadProps {
  documents: SupportingDocument[];
  onChange: (documents: SupportingDocument[]) => void;
  onReceiptDetailsChange?: (details: TransferReceiptDetails[]) => void;
  existingReceiptDetails?: TransferReceiptDetails[];
}

const CostDocumentUpload = ({ documents, onChange, onReceiptDetailsChange, existingReceiptDetails }: CostDocumentUploadProps) => {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const { logEvent } = useAuditLog();
  const [isUploading, setIsUploading] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [pendingReceiptDoc, setPendingReceiptDoc] = useState<{
    url: string;
    filename: string;
    index: number;
  } | null>(null);
  const [localReceiptDetails, setLocalReceiptDetails] = useState<Map<string, TransferReceiptDetails>>(new Map());
  const [editingReceiptDetails, setEditingReceiptDetails] = useState<TransferReceiptDetails | undefined>(undefined);

  useEffect(() => {
    if (existingReceiptDetails !== undefined) {
      const detailsMap = new Map<string, TransferReceiptDetails>();
      existingReceiptDetails.forEach(rd => {
        if (rd.receiptImageUrl) {
          detailsMap.set(rd.receiptImageUrl, rd);
        }
      });
      setLocalReceiptDetails(detailsMap);
    }
  }, [existingReceiptDetails]);

  const extendedDocs: ExtendedSupportingDocument[] = documents.map(doc => ({
    ...doc,
    receiptDetails: localReceiptDetails.get(doc.url)
  }));

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      const uploadedDocs: ExtendedSupportingDocument[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const filePath = `cost-receipts/${fileName}`;

        const { data, error } = await supabase.storage
          .from('uploads')
          .upload(filePath, file);

        if (error) {
          console.error('Upload error:', error);
          throw new Error(`Failed to upload ${file.name}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('uploads')
          .getPublicUrl(filePath);

        const isImage = file.type.startsWith('image/');
        const isPDF = file.type === 'application/pdf';
        const documentType = isImage ? 'receipt_photo' : isPDF ? 'receipt_pdf' : 'other';

        const newDoc: ExtendedSupportingDocument = {
          url: publicUrlData.publicUrl,
          type: documentType,
          filename: file.name,
          uploadedAt: new Date().toISOString(),
          size: file.size,
          description: ''
        };

        uploadedDocs.push(newDoc);
      }

      const baseDocs = uploadedDocs.map(({ receiptDetails, ...doc }) => doc);
      const newDocs = [...documents, ...baseDocs];
      onChange(newDocs);

      if (uploadedDocs.length === 1 && 
          (uploadedDocs[0].type === 'receipt_photo' || uploadedDocs[0].type === 'receipt_pdf')) {
        const newIndex = newDocs.length - 1;
        setPendingReceiptDoc({
          url: uploadedDocs[0].url,
          filename: uploadedDocs[0].filename,
          index: newIndex
        });
        setShowReceiptDialog(true);
      } else {
        toast({
          title: "Success",
          description: `${uploadedDocs.length} document(s) uploaded successfully`
        });
      }

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

  const handleReceiptConfirm = (details: TransferReceiptDetails) => {
    if (pendingReceiptDoc === null) return;

    const newReceiptDetailsMap = new Map(localReceiptDetails);
    newReceiptDetailsMap.set(pendingReceiptDoc.url, details);
    setLocalReceiptDetails(newReceiptDetailsMap);

    const docToUpdate = documents[pendingReceiptDoc.index];
    if (docToUpdate) {
      const updatedDoc = {
        ...docToUpdate,
        description: `Transfer: ${details.transactionNumber} - ${details.recipientAccountName} - ${details.transferAmount} ${details.currency}`
      };
      const newDocs = [...documents];
      newDocs[pendingReceiptDoc.index] = updatedDoc;
      onChange(newDocs);
    }

    if (onReceiptDetailsChange) {
      const allDetails = Array.from(newReceiptDetailsMap.values());
      onReceiptDetailsChange(allDetails);
    }

    toast({
      title: "Receipt Details Saved",
      description: `Transfer details for ${details.transactionNumber} have been recorded.`
    });

    logEvent({
      module: 'financial',
      action: 'verify',
      entityType: 'receipt',
      entityId: details.transactionNumber,
      entityName: pendingReceiptDoc.filename,
      description: `Receipt validated: ${details.transactionNumber} - ${details.recipientAccountName} - ${details.transferAmount} ${details.currency}`,
      metadata: {
        transactionNumber: details.transactionNumber,
        recipientAccountName: details.recipientAccountName,
        bankName: details.bankName,
        transferAmount: details.transferAmount,
        currency: details.currency,
        transferDate: details.transferDate,
        receiptImageUrl: details.receiptImageUrl,
      },
      tags: ['receipt', 'validation', 'transfer'],
    });

    setPendingReceiptDoc(null);
    setEditingReceiptDetails(undefined);
    setShowReceiptDialog(false);
  };

  const handleReceiptCancel = () => {
    setPendingReceiptDoc(null);
    setEditingReceiptDetails(undefined);
    setShowReceiptDialog(false);
    toast({
      title: "Document Uploaded",
      description: "Receipt uploaded without transfer details. You can add details later."
    });
  };

  const handleEditReceipt = (index: number) => {
    const doc = extendedDocs[index];
    if (doc) {
      setPendingReceiptDoc({
        url: doc.url,
        filename: doc.filename,
        index
      });
      setEditingReceiptDetails(doc.receiptDetails);
      setShowReceiptDialog(true);
    }
  };

  const handleRemoveDocument = (index: number) => {
    const docToRemove = documents[index];
    const newReceiptDetailsMap = new Map(localReceiptDetails);
    
    if (docToRemove) {
      newReceiptDetailsMap.delete(docToRemove.url);
      setLocalReceiptDetails(newReceiptDetailsMap);
    }
    
    const newDocs = documents.filter((_, i) => i !== index);
    onChange(newDocs);

    if (onReceiptDetailsChange) {
      const allDetails = newDocs
        .map(doc => newReceiptDetailsMap.get(doc.url))
        .filter((d): d is TransferReceiptDetails => d !== undefined);
      onReceiptDetailsChange(allDetails);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (doc: ExtendedSupportingDocument) => {
    if (doc.receiptDetails) return <Receipt className="h-5 w-5 text-green-600" />;
    if (doc.type === 'receipt_photo') return <ImageIcon className="h-5 w-5 text-blue-600" />;
    if (doc.type === 'receipt_pdf') return <FileText className="h-5 w-5 text-red-600" />;
    return <File className="h-5 w-5 text-gray-600" />;
  };

  return (
    <div className="space-y-4">
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
                  Upload Transfer Receipt
                </>
              )}
            </span>
          </Button>
        </label>
        <p className="text-xs text-muted-foreground mt-2">
          Upload your bank transfer receipt. The system will prompt you to enter the transfer details for validation.
        </p>
      </div>

      {extendedDocs.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Uploaded Documents ({extendedDocs.length})</p>
          <div className="space-y-2">
            {extendedDocs.map((doc, index) => (
              <Card key={index} data-testid={`document-${index}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getFileIcon(doc)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.filename}</p>
                        <div className="flex items-center flex-wrap gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {doc.type.replace('_', ' ')}
                          </Badge>
                          {doc.size && (
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(doc.size)}
                            </span>
                          )}
                          {doc.receiptDetails && (
                            <Badge variant="secondary" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Validated
                            </Badge>
                          )}
                        </div>
                        {doc.receiptDetails && (
                          <div className="mt-2 text-xs text-muted-foreground space-y-1">
                            <p>TXN: {doc.receiptDetails.transactionNumber}</p>
                            <p>To: {doc.receiptDetails.recipientAccountName}</p>
                            <p>Amount: {doc.receiptDetails.transferAmount} {doc.receiptDetails.currency}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {(doc.type === 'receipt_photo' || doc.type === 'receipt_pdf') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditReceipt(index)}
                          title={doc.receiptDetails ? "Edit details" : "Add details"}
                          data-testid={`button-edit-${index}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
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

      {pendingReceiptDoc && (
        <ReceiptDetailsDialog
          open={showReceiptDialog}
          onOpenChange={setShowReceiptDialog}
          receiptImageUrl={pendingReceiptDoc.url}
          filename={pendingReceiptDoc.filename}
          onConfirm={handleReceiptConfirm}
          onCancel={handleReceiptCancel}
          userId={currentUser?.id || 'unknown'}
          initialData={editingReceiptDetails}
        />
      )}
    </div>
  );
};

export default CostDocumentUpload;
