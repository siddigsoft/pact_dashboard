import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
} from "lucide-react";

const VALID_CATEGORIES: Record<string, string> = {
  "permits": "permits",
  "permits & licenses": "permits",
  "permits and licenses": "permits",
  "incentives": "incentives",
  "incentives & allowances": "incentives",
  "incentives and allowances": "incentives",
  "communications": "communications",
  "internet & comms": "communications",
  "internet and comms": "communications",
  "internet": "communications",
  "training": "training",
  "transportation": "general_transport",
  "general_transport": "general_transport",
  "transport": "general_transport",
  "equipment": "equipment",
  "equipment & supplies": "equipment",
  "equipment and supplies": "equipment",
  "supplies": "equipment",
  "printing": "printing",
  "printing & stationery": "printing",
  "printing and stationery": "printing",
  "stationery": "printing",
  "meetings": "meetings",
  "other": "other",
};

interface ParsedItem {
  id: string;
  expenseCategory: string;
  otherCategoryDetail: string;
  title: string;
  quantity: number;
  unitCost: number;
  amount: number;
  currency: string;
  description: string;
  justification: string;
  vendor: string;
  referenceNumber: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ExcelUploadParserProps {
  onItemsParsed: (items: ParsedItem[]) => void;
}

function normalizeCategory(raw: string): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return VALID_CATEGORIES[key] || null;
}

function downloadTemplate() {
  const headers = [
    "Category",
    "Title",
    "Quantity",
    "Unit Cost",
    "Currency",
    "Description",
    "Justification",
    "Vendor (Optional)",
    "Reference # (Optional)",
    "Other Category Detail (if Other)",
  ];

  const sampleRows = [
    [
      "Training",
      "Workshop materials for data collectors",
      5,
      2500,
      "SDG",
      "Purchase of notebooks, pens, and reference guides for field training workshop",
      "Required for upcoming Q2 training session with new field staff",
      "Al-Nour Supplies",
      "INV-2025-001",
      "",
    ],
    [
      "Transportation",
      "Vehicle rental for site visits",
      3,
      15000,
      "SDG",
      "Rental of 4x4 vehicles for remote site access during monitoring visits",
      "Sites are inaccessible by public transport, vehicles needed for 3-day field trip",
      "Sudan Car Rental",
      "SCR-4521",
      "",
    ],
    [
      "Other",
      "Office generator fuel",
      10,
      5000,
      "SDG",
      "Diesel fuel for backup generator to maintain operations during power outages",
      "Frequent power cuts affecting data processing and communication",
      "National Petroleum",
      "",
      "Generator Fuel",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);

  const colWidths = [18, 35, 10, 12, 10, 50, 50, 25, 20, 25];
  ws["!cols"] = colWidths.map((w) => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cost Items");

  const catSheet = XLSX.utils.aoa_to_sheet([
    ["Valid Categories"],
    ["Permits & Licenses"],
    ["Incentives & Allowances"],
    ["Internet & Comms"],
    ["Training"],
    ["Transportation"],
    ["Equipment & Supplies"],
    ["Printing & Stationery"],
    ["Meetings"],
    ["Other (specify in 'Other Category Detail' column)"],
  ]);
  catSheet["!cols"] = [{ wch: 45 }];
  XLSX.utils.book_append_sheet(wb, catSheet, "Valid Categories");

  XLSX.writeFile(wb, "cost_submission_template.xlsx");
}

export default function ExcelUploadParser({ onItemsParsed }: ExcelUploadParserProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [parsing, setParsing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [parsedCount, setParsedCount] = useState<number | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      toast({
        title: "Invalid File",
        description: "Please upload an Excel file (.xlsx, .xls) or CSV file.",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setParsing(true);
    setValidationErrors([]);
    setParsedCount(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (rows.length < 2) {
        toast({
          title: "Empty File",
          description: "The file has no data rows. Please add at least one expense item.",
          variant: "destructive",
        });
        setParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const headerRow = rows[0].map((h: any) => String(h).trim().toLowerCase());
      const colMap: Record<string, number> = {};

      const fieldMappings: Record<string, string[]> = {
        category: ["category", "expense category", "expense_category", "type"],
        title: ["title", "item title", "request title", "name", "item"],
        quantity: ["quantity", "qty", "count", "units"],
        unitCost: ["unit cost", "unit_cost", "unitcost", "price", "unit price", "rate", "cost per unit"],
        currency: ["currency", "cur", "cur."],
        description: ["description", "details", "desc"],
        justification: ["justification", "reason", "why", "rationale"],
        vendor: ["vendor", "supplier", "vendor/supplier", "vendor name"],
        referenceNumber: ["reference", "reference #", "ref", "ref #", "reference number", "invoice", "receipt", "invoice/receipt"],
        otherDetail: ["other category detail", "other detail", "other category", "specify", "other"],
      };

      for (const [field, aliases] of Object.entries(fieldMappings)) {
        const idx = headerRow.findIndex((h: string) => aliases.includes(h));
        if (idx >= 0) colMap[field] = idx;
      }

      if (colMap.category === undefined && colMap.title === undefined) {
        toast({
          title: "Unrecognized Format",
          description:
            "Could not find 'Category' or 'Title' columns. Please use the template or ensure your headers match.",
          variant: "destructive",
        });
        setParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const errors: ValidationError[] = [];
      const items: ParsedItem[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every((cell: any) => !cell && cell !== 0)) continue;

        const rowNum = i + 1;
        const rawCategory = colMap.category !== undefined ? String(row[colMap.category] || "").trim() : "";
        const title = colMap.title !== undefined ? String(row[colMap.title] || "").trim() : "";
        const rawQty = colMap.quantity !== undefined ? row[colMap.quantity] : 1;
        const rawUnitCost = colMap.unitCost !== undefined ? row[colMap.unitCost] : 0;
        const currency = colMap.currency !== undefined ? String(row[colMap.currency] || "SDG").trim().toUpperCase() : "SDG";
        const description = colMap.description !== undefined ? String(row[colMap.description] || "").trim() : "";
        const justification = colMap.justification !== undefined ? String(row[colMap.justification] || "").trim() : "";
        const vendor = colMap.vendor !== undefined ? String(row[colMap.vendor] || "").trim() : "";
        const referenceNumber = colMap.referenceNumber !== undefined ? String(row[colMap.referenceNumber] || "").trim() : "";
        const otherDetail = colMap.otherDetail !== undefined ? String(row[colMap.otherDetail] || "").trim() : "";

        const category = normalizeCategory(rawCategory);
        if (!category) {
          errors.push({ row: rowNum, field: "Category", message: `"${rawCategory}" is not a valid category` });
        }

        if (!title || title.length < 3) {
          errors.push({ row: rowNum, field: "Title", message: "Title is required (min 3 characters)" });
        }

        const quantity = parseInt(String(rawQty)) || 0;
        if (quantity <= 0) {
          errors.push({ row: rowNum, field: "Quantity", message: "Quantity must be at least 1" });
        }

        const unitCost = parseFloat(String(rawUnitCost)) || 0;
        if (unitCost <= 0) {
          errors.push({ row: rowNum, field: "Unit Cost", message: "Unit cost must be greater than 0" });
        }

        if (!["SDG", "USD"].includes(currency)) {
          errors.push({ row: rowNum, field: "Currency", message: `"${currency}" is not valid. Use SDG or USD` });
        }

        if (!description || description.length < 10) {
          errors.push({ row: rowNum, field: "Description", message: "Description required (min 10 characters)" });
        }

        if (!justification || justification.length < 10) {
          errors.push({ row: rowNum, field: "Justification", message: "Justification required (min 10 characters)" });
        }

        if (category === "other" && (!otherDetail || otherDetail.length < 3)) {
          errors.push({ row: rowNum, field: "Other Detail", message: "Please specify the 'Other' category type (min 3 chars)" });
        }

        items.push({
          id: uuidv4(),
          expenseCategory: category || "",
          otherCategoryDetail: otherDetail,
          title,
          quantity: quantity > 0 ? quantity : 1,
          unitCost: unitCost > 0 ? unitCost : 0,
          amount: (quantity > 0 ? quantity : 1) * (unitCost > 0 ? unitCost : 0),
          currency: ["SDG", "USD"].includes(currency) ? currency : "SDG",
          description,
          justification,
          vendor,
          referenceNumber,
        });
      }

      setValidationErrors(errors);

      if (errors.length > 0) {
        toast({
          title: `${errors.length} Validation Issue${errors.length > 1 ? "s" : ""} Found`,
          description: "Items were imported but some have issues. Please review and fix them in the form.",
          variant: "destructive",
        });
      }

      if (items.length > 0) {
        onItemsParsed(items);
        setParsedCount(items.length);
        toast({
          title: "Items Imported",
          description: `${items.length} expense item${items.length > 1 ? "s" : ""} loaded from Excel.${errors.length > 0 ? " Some items need corrections." : ""}`,
        });
      } else {
        toast({
          title: "No Items Found",
          description: "Could not find any valid data rows in the file.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Excel parse error:", err);
      toast({
        title: "Parse Error",
        description: "Failed to read the Excel file. Please check the format and try again.",
        variant: "destructive",
      });
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileChange}
          className="hidden"
          data-testid="input-excel-upload"
        />
        <Button
          type="button"
          variant="outline"
          className="gap-2 border-dashed flex-1 min-w-[200px]"
          onClick={() => fileInputRef.current?.click()}
          disabled={parsing}
          data-testid="button-upload-excel"
        >
          {parsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading file...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              <FileSpreadsheet className="h-4 w-4" />
              Upload Excel / CSV
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={downloadTemplate}
          data-testid="button-download-template"
        >
          <Download className="h-3.5 w-3.5" />
          Download Template
        </Button>
      </div>

      {parsedCount !== null && validationErrors.length === 0 && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-800 dark:text-green-300 text-sm">
            {parsedCount} item{parsedCount > 1 ? "s" : ""} imported successfully with no issues.
          </AlertDescription>
        </Alert>
      )}

      {validationErrors.length > 0 && (
        <Alert variant="destructive" className="relative">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm">
                {validationErrors.length} issue{validationErrors.length > 1 ? "s" : ""} found (items imported - please fix in form)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 -mr-1"
                onClick={() => setValidationErrors([])}
                data-testid="button-dismiss-errors"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
              {validationErrors.slice(0, 15).map((err, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    Row {err.row}
                  </Badge>
                  <span>{err.field}: {err.message}</span>
                </li>
              ))}
              {validationErrors.length > 15 && (
                <li className="text-muted-foreground">...and {validationErrors.length - 15} more</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
