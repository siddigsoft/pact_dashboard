import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { SupportingDocument } from "@/types/cost-submission";
import { TransferReceiptDetails } from "@/types/receipt-details";
import { supabase } from "@/integrations/supabase/client";
import { ReceiptDetailsDialog } from "./ReceiptDetailsDialog";
import { FilePreviewDialog } from "@/components/ui/FilePreviewDialog";
import {
  Upload,
  File,
  X,
  Loader2,
  FileText,
  Image as ImageIcon,
  Receipt,
  CheckCircle,
  Edit2,
  FileSpreadsheet,
  FileArchive,
  Paperclip,
  Eye,
  Pencil,
  Check,
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

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "application/pdf": "pdf",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.ms-excel": "excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "text/csv": "excel",
  "text/plain": "text",
  "application/zip": "archive",
  "application/x-zip-compressed": "archive",
};

const ALLOWED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".pdf",
  ".doc", ".docx",
  ".xls", ".xlsx", ".csv",
  ".txt",
  ".zip",
];

const MAX_SIZE_MB = 20;

function getFileKind(mimeType: string, filename: string): string {
  if (ALLOWED_TYPES[mimeType]) return ALLOWED_TYPES[mimeType];
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (ext === "txt") return "text";
  if (ext === "zip") return "archive";
  return "other";
}

function getDocumentType(kind: string): SupportingDocument["type"] {
  if (kind === "image") return "receipt_photo";
  if (kind === "pdf") return "receipt_pdf";
  return "other";
}

function FileKindIcon({ kind, className = "h-5 w-5" }: { kind: string; className?: string }) {
  if (kind === "image") return <ImageIcon className={`${className} text-blue-500`} />;
  if (kind === "pdf") return <FileText className={`${className} text-red-500`} />;
  if (kind === "word") return <FileText className={`${className} text-indigo-500`} />;
  if (kind === "excel") return <FileSpreadsheet className={`${className} text-green-600`} />;
  if (kind === "archive") return <FileArchive className={`${className} text-orange-500`} />;
  return <File className={`${className} text-muted-foreground`} />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const CostDocumentUpload = ({
  documents,
  onChange,
  onReceiptDetailsChange,
  existingReceiptDetails,
}: CostDocumentUploadProps) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; filename: string } | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [pendingReceiptDoc, setPendingReceiptDoc] = useState<{
    url: string;
    filename: string;
    index: number;
  } | null>(null);
  const [editingReceiptDetails, setEditingReceiptDetails] = useState<TransferReceiptDetails | undefined>(undefined);
  const [localReceiptDetails, setLocalReceiptDetails] = useState<Map<string, TransferReceiptDetails>>(new Map());
  const [editingLabelIdx, setEditingLabelIdx] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    if (existingReceiptDetails) {
      const m = new Map<string, TransferReceiptDetails>();
      existingReceiptDetails.forEach((rd) => { if (rd.receiptImageUrl) m.set(rd.receiptImageUrl, rd); });
      setLocalReceiptDetails(m);
    }
  }, [existingReceiptDetails]);

  const extendedDocs: ExtendedSupportingDocument[] = documents.map((doc) => ({
    ...doc,
    receiptDetails: localReceiptDetails.get(doc.url),
  }));

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const uploaded: ExtendedSupportingDocument[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          throw new Error(`"${file.name}" is too large. Max size is ${MAX_SIZE_MB}MB.`);
        }
        const kind = getFileKind(file.type, file.name);
        if (kind === "other" && !ALLOWED_TYPES[file.type]) {
          const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new Error(`File type not allowed: "${file.name}". Accepted: PDF, Word, Excel, images, CSV, TXT, ZIP.`);
          }
        }
        const ts = Date.now();
        const rand = Math.random().toString(36).substring(2, 8);
        const ext = file.name.split(".").pop()?.toLowerCase() || "file";
        const safeName = `${ts}_${rand}.${ext}`;
        const filePath = `cost-receipts/${safeName}`;
        const { error } = await supabase.storage.from("mmp-files").upload(filePath, file, { cacheControl: "3600", upsert: false });
        if (error) throw new Error(`Failed to upload "${file.name}": ${error.message}`);
        const { data: pub } = supabase.storage.from("mmp-files").getPublicUrl(filePath);
        uploaded.push({
          url: pub.publicUrl,
          type: getDocumentType(kind),
          filename: file.name,
          uploadedAt: new Date().toISOString(),
          size: file.size,
          description: "",
        });
      }
      const baseDocs = uploaded.map(({ receiptDetails: _, ...d }) => d);
      onChange([...documents, ...baseDocs]);
      toast({ title: `${uploaded.length} file${uploaded.length > 1 ? "s" : ""} attached`, description: "Supporting documents added to your request." });
      e.target.value = "";
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message || "Could not upload file.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = (idx: number) => {
    const docToRemove = documents[idx];
    const newMap = new Map(localReceiptDetails);
    if (docToRemove) newMap.delete(docToRemove.url);
    setLocalReceiptDetails(newMap);
    const newDocs = documents.filter((_, i) => i !== idx);
    onChange(newDocs);
    if (onReceiptDetailsChange) {
      onReceiptDetailsChange(newDocs.map((d) => newMap.get(d.url)).filter((d): d is TransferReceiptDetails => !!d));
    }
  };

  const handleSaveLabel = (idx: number) => {
    const newDocs = [...documents];
    newDocs[idx] = { ...newDocs[idx], description: labelDraft };
    onChange(newDocs);
    setEditingLabelIdx(null);
    setLabelDraft("");
  };

  const handleReceiptConfirm = (details: TransferReceiptDetails) => {
    if (!pendingReceiptDoc) return;
    const newMap = new Map(localReceiptDetails);
    newMap.set(pendingReceiptDoc.url, details);
    setLocalReceiptDetails(newMap);
    const newDocs = [...documents];
    newDocs[pendingReceiptDoc.index] = {
      ...newDocs[pendingReceiptDoc.index],
      description: `Transfer: ${details.transactionNumber} — ${details.recipientAccountName} — ${details.transferAmount} ${details.currency}`,
    };
    onChange(newDocs);
    if (onReceiptDetailsChange) onReceiptDetailsChange(Array.from(newMap.values()));
    toast({ title: "Receipt Details Saved", description: `Transfer ${details.transactionNumber} recorded.` });
    setPendingReceiptDoc(null);
    setEditingReceiptDetails(undefined);
    setShowReceiptDialog(false);
  };

  const handleReceiptCancel = () => {
    setPendingReceiptDoc(null);
    setEditingReceiptDetails(undefined);
    setShowReceiptDialog(false);
  };

  const openReceiptDialog = (idx: number) => {
    const doc = extendedDocs[idx];
    if (!doc) return;
    setPendingReceiptDoc({ url: doc.url, filename: doc.filename, index: idx });
    setEditingReceiptDetails(doc.receiptDetails);
    setShowReceiptDialog(true);
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTENSIONS.join(",")}
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
        data-testid="input-file-upload"
      />

      <button
        type="button"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        data-testid="button-upload-document"
        className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 hover:bg-muted/40 hover:border-muted-foreground/50 transition-colors px-4 py-6 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Uploading…</span>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2">
              <Paperclip className="h-5 w-5 text-muted-foreground" />
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium">Attach Supporting Documents</span>
            <span className="text-xs text-muted-foreground text-center">
              PDF, Word, Excel, images, CSV, TXT, ZIP — up to {MAX_SIZE_MB}MB each. Multiple files allowed.
            </span>
          </>
        )}
      </button>

      {extendedDocs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {extendedDocs.length} attached file{extendedDocs.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {extendedDocs.map((doc, idx) => {
              const kind = getFileKind(doc.type === "receipt_photo" ? "image/jpeg" : doc.type === "receipt_pdf" ? "application/pdf" : "application/octet-stream", doc.filename);
              const isEditingLabel = editingLabelIdx === idx;
              return (
                <Card key={idx} data-testid={`document-${idx}`} className="border border-border/60">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {doc.receiptDetails
                          ? <Receipt className="h-5 w-5 text-green-600" />
                          : <FileKindIcon kind={kind} />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium truncate" title={doc.filename}>{doc.filename}</p>
                        <div className="flex items-center flex-wrap gap-1.5">
                          {doc.size && (
                            <span className="text-xs text-muted-foreground">{formatSize(doc.size)}</span>
                          )}
                          {doc.receiptDetails && (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <CheckCircle className="h-2.5 w-2.5" />
                              Validated
                            </Badge>
                          )}
                        </div>
                        {isEditingLabel ? (
                          <div className="flex items-center gap-1.5 mt-1">
                            <Input
                              autoFocus
                              value={labelDraft}
                              onChange={(e) => setLabelDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleSaveLabel(idx); if (e.key === "Escape") setEditingLabelIdx(null); }}
                              placeholder="e.g. Invoice from supplier, Budget breakdown…"
                              className="h-7 text-xs"
                              data-testid={`input-label-${idx}`}
                            />
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => handleSaveLabel(idx)} data-testid={`button-save-label-${idx}`}>
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingLabelIdx(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          doc.description ? (
                            <p className="text-xs text-muted-foreground italic truncate">{doc.description}</p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setEditingLabelIdx(idx); setLabelDraft(doc.description || ""); }}
                              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1"
                              data-testid={`button-add-label-${idx}`}
                            >
                              <Pencil className="h-2.5 w-2.5" />
                              Add a label…
                            </button>
                          )
                        )}
                        {doc.receiptDetails && (
                          <div className="text-xs text-muted-foreground space-y-0.5 pt-0.5">
                            <p>TXN: {doc.receiptDetails.transactionNumber}</p>
                            <p>To: {doc.receiptDetails.recipientAccountName} — {doc.receiptDetails.transferAmount} {doc.receiptDetails.currency}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {(doc.type === "receipt_photo" || doc.type === "receipt_pdf") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openReceiptDialog(idx)}
                            title={doc.receiptDetails ? "Edit transfer details" : "Add transfer details"}
                            data-testid={`button-edit-${idx}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setPreviewFile({ url: doc.url, filename: doc.filename })}
                          title="Preview"
                          data-testid={`button-view-${idx}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleRemove(idx)}
                          title="Remove"
                          data-testid={`button-remove-${idx}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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
          userId={""}
          initialData={editingReceiptDetails}
        />
      )}

      <FilePreviewDialog
        open={!!previewFile}
        onOpenChange={(o) => { if (!o) setPreviewFile(null); }}
        url={previewFile?.url ?? ""}
        filename={previewFile?.filename}
      />
    </div>
  );
};

export default CostDocumentUpload;
