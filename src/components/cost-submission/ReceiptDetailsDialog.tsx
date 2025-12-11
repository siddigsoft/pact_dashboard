import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TransferReceiptDetails,
  SUDANESE_BANKS,
  CURRENCIES,
  validateReceiptDetails,
} from "@/types/receipt-details";
import { format } from "date-fns";
import {
  Receipt,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Calendar,
  Building2,
  User,
  Hash,
  DollarSign,
  MessageSquare,
} from "lucide-react";

interface ReceiptDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptImageUrl: string;
  filename: string;
  onConfirm: (details: TransferReceiptDetails) => void;
  onCancel: () => void;
  userId: string;
  initialData?: TransferReceiptDetails;
}

export function ReceiptDetailsDialog({
  open,
  onOpenChange,
  receiptImageUrl,
  filename,
  onConfirm,
  onCancel,
  userId,
  initialData,
}: ReceiptDetailsDialogProps) {
  const getDefaultFormData = (): Partial<TransferReceiptDetails> => {
    if (initialData) {
      return { ...initialData, receiptImageUrl };
    }
    return {
      transactionNumber: "",
      recipientAccountName: "",
      recipientAccountNumber: "",
      bankName: "Bank of Khartoum",
      transferAmount: 0,
      currency: "SDG",
      transferDate: format(new Date(), "yyyy-MM-dd"),
      referenceNumber: "",
      senderName: "",
      senderAccountNumber: "",
      comments: "",
      receiptImageUrl: receiptImageUrl,
    };
  };

  const [formData, setFormData] = useState<Partial<TransferReceiptDetails>>(getDefaultFormData());
  const [validation, setValidation] = useState<ReturnType<typeof validateReceiptDetails> | null>(null);

  useEffect(() => {
    if (open) {
      setFormData(getDefaultFormData());
      setValidation(null);
    }
  }, [open, initialData, receiptImageUrl]);

  const handleInputChange = (field: keyof TransferReceiptDetails, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setValidation(null);
  };

  const handleValidate = () => {
    const result = validateReceiptDetails(formData);
    setValidation(result);
    return result.isValid;
  };

  const handleConfirm = () => {
    if (!handleValidate()) return;

    const details: TransferReceiptDetails = {
      transactionNumber: formData.transactionNumber || "",
      recipientAccountName: formData.recipientAccountName || "",
      recipientAccountNumber: formData.recipientAccountNumber,
      bankName: formData.bankName || "",
      transferAmount: formData.transferAmount || 0,
      currency: formData.currency || "SDG",
      transferDate: formData.transferDate || format(new Date(), "yyyy-MM-dd"),
      referenceNumber: formData.referenceNumber,
      senderName: formData.senderName,
      senderAccountNumber: formData.senderAccountNumber,
      comments: formData.comments,
      receiptImageUrl: receiptImageUrl,
      validatedAt: new Date().toISOString(),
      validatedBy: userId,
    };

    onConfirm(details);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Enter Transfer Receipt Details
          </DialogTitle>
          <DialogDescription>
            Please enter the details from your bank transfer receipt for validation and record-keeping.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Receipt className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{filename}</p>
                      <p className="text-xs text-muted-foreground">Uploaded Receipt</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(receiptImageUrl, "_blank")}
                    data-testid="button-view-receipt"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Receipt
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="transactionNumber" className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Transaction Number *
                </Label>
                <Input
                  id="transactionNumber"
                  placeholder="e.g., TXN123456789"
                  value={formData.transactionNumber || ""}
                  onChange={(e) => handleInputChange("transactionNumber", e.target.value)}
                  data-testid="input-transaction-number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="referenceNumber" className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Reference Number
                </Label>
                <Input
                  id="referenceNumber"
                  placeholder="Optional reference"
                  value={formData.referenceNumber || ""}
                  onChange={(e) => handleInputChange("referenceNumber", e.target.value)}
                  data-testid="input-reference-number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipientAccountName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Recipient Account Name *
                </Label>
                <Input
                  id="recipientAccountName"
                  placeholder="Name on receiving account"
                  value={formData.recipientAccountName || ""}
                  onChange={(e) => handleInputChange("recipientAccountName", e.target.value)}
                  data-testid="input-recipient-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipientAccountNumber" className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Recipient Account Number
                </Label>
                <Input
                  id="recipientAccountNumber"
                  placeholder="Account number"
                  value={formData.recipientAccountNumber || ""}
                  onChange={(e) => handleInputChange("recipientAccountNumber", e.target.value)}
                  data-testid="input-recipient-account"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankName" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Bank Name *
                </Label>
                <Select
                  value={formData.bankName || "Bank of Khartoum"}
                  onValueChange={(value) => handleInputChange("bankName", value)}
                >
                  <SelectTrigger id="bankName" data-testid="select-bank">
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUDANESE_BANKS.map((bank) => (
                      <SelectItem key={bank.code} value={bank.name}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transferDate" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Transfer Date *
                </Label>
                <Input
                  id="transferDate"
                  type="date"
                  value={formData.transferDate || ""}
                  onChange={(e) => handleInputChange("transferDate", e.target.value)}
                  data-testid="input-transfer-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="transferAmount" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Transfer Amount *
                </Label>
                <Input
                  id="transferAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.transferAmount || ""}
                  onChange={(e) => handleInputChange("transferAmount", parseFloat(e.target.value) || 0)}
                  data-testid="input-transfer-amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Currency *
                </Label>
                <Select
                  value={formData.currency || "SDG"}
                  onValueChange={(value) => handleInputChange("currency", value)}
                >
                  <SelectTrigger id="currency" data-testid="select-currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((curr) => (
                      <SelectItem key={curr.code} value={curr.code}>
                        {curr.symbol} - {curr.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="senderName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Sender Name
                </Label>
                <Input
                  id="senderName"
                  placeholder="Name of sender"
                  value={formData.senderName || ""}
                  onChange={(e) => handleInputChange("senderName", e.target.value)}
                  data-testid="input-sender-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="senderAccountNumber" className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Sender Account Number
                </Label>
                <Input
                  id="senderAccountNumber"
                  placeholder="Sender's account"
                  value={formData.senderAccountNumber || ""}
                  onChange={(e) => handleInputChange("senderAccountNumber", e.target.value)}
                  data-testid="input-sender-account"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comments" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments / Notes
              </Label>
              <Textarea
                id="comments"
                placeholder="Any additional notes about this transfer..."
                value={formData.comments || ""}
                onChange={(e) => handleInputChange("comments", e.target.value)}
                rows={3}
                data-testid="input-comments"
              />
            </div>

            {validation && !validation.isValid && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 mt-1">
                    {validation.errors.map((error, index) => (
                      <li key={index}>{error.message}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {validation && validation.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 mt-1">
                    {validation.warnings.map((warning, index) => (
                      <li key={index}>{warning.message}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {validation?.isValid && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-300">
                  All required fields are valid. Ready to confirm.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel-receipt">
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleValidate} data-testid="button-validate-receipt">
            Validate
          </Button>
          <Button onClick={handleConfirm} data-testid="button-confirm-receipt">
            <CheckCircle className="h-4 w-4 mr-2" />
            Confirm Details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReceiptDetailsDialog;
