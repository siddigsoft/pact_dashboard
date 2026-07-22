import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "@/types";

// ── Country presets ─────────────────────────────────────────────────────────
interface CountryPreset {
  label: string;
  flag: string;
  currency: string;
  accountNumberHint: string;
  // which fields to highlight as required/recommended
  required: string[];
  recommended: string[];
  tip?: string;
}

const COUNTRY_PRESETS: Record<string, CountryPreset> = {
  SD: { label: "Sudan",        flag: "🇸🇩", currency: "SDG", accountNumberHint: "e.g. 1234567",
        required: ["accountName", "bankName", "accountNumber"],
        recommended: ["branch"],
        tip: "Sudanese accounts typically use 7-digit account numbers." },
  SS: { label: "South Sudan",  flag: "🇸🇸", currency: "SSP", accountNumberHint: "Enter account number",
        required: ["accountName", "bankName", "accountNumber"],
        recommended: ["branch"], tip: undefined },
  KE: { label: "Kenya",        flag: "🇰🇪", currency: "KES", accountNumberHint: "e.g. 0123456789",
        required: ["accountName", "bankName", "accountNumber"],
        recommended: ["branch"],
        tip: "Kenyan banks typically use 10–14 digit account numbers." },
  ET: { label: "Ethiopia",     flag: "🇪🇹", currency: "ETB", accountNumberHint: "Enter account number",
        required: ["accountName", "bankName", "accountNumber"],
        recommended: ["branch"], tip: undefined },
  UG: { label: "Uganda",       flag: "🇺🇬", currency: "UGX", accountNumberHint: "Enter account number",
        required: ["accountName", "bankName", "accountNumber"],
        recommended: ["branch"], tip: undefined },
  EG: { label: "Egypt",        flag: "🇪🇬", currency: "EGP", accountNumberHint: "e.g. 000012345678901",
        required: ["accountName", "bankName", "accountNumber"],
        recommended: ["iban", "swiftBic"],
        tip: "Egyptian banks increasingly support IBAN for international transfers." },
  JO: { label: "Jordan",       flag: "🇯🇴", currency: "JOD", accountNumberHint: "Enter account number",
        required: ["accountName", "bankName", "accountNumber", "iban"],
        recommended: ["swiftBic"],
        tip: "IBAN is required for international transfers from Jordanian banks." },
  AE: { label: "UAE",          flag: "🇦🇪", currency: "AED", accountNumberHint: "Enter account number",
        required: ["accountName", "bankName", "accountNumber", "iban", "swiftBic"],
        recommended: [],
        tip: "UAE banks require IBAN and SWIFT/BIC for all transfers." },
  GB: { label: "United Kingdom", flag: "🇬🇧", currency: "GBP", accountNumberHint: "e.g. 12345678 (8 digits)",
        required: ["accountName", "bankName", "accountNumber", "routingNumber"],
        recommended: ["iban", "swiftBic"],
        tip: "UK accounts need a Sort Code (routing) and 8-digit account number. IBAN starts with GB." },
  US: { label: "United States", flag: "🇺🇸", currency: "USD", accountNumberHint: "Enter account number",
        required: ["accountName", "bankName", "accountNumber", "routingNumber"],
        recommended: [],
        tip: "US banks require a 9-digit ABA Routing Number alongside the account number." },
  DE: { label: "Germany",      flag: "🇩🇪", currency: "EUR", accountNumberHint: "Enter account number",
        required: ["accountName", "bankName", "accountNumber", "iban", "swiftBic"],
        recommended: [],
        tip: "German banks require IBAN and SWIFT/BIC (BIC). IBAN starts with DE." },
  FR: { label: "France",       flag: "🇫🇷", currency: "EUR", accountNumberHint: "Enter account number",
        required: ["accountName", "bankName", "accountNumber", "iban", "swiftBic"],
        recommended: [],
        tip: "French IBANs start with FR and are required for all SEPA transfers." },
  OTHER: { label: "Other country", flag: "🌍", currency: "", accountNumberHint: "Enter account number",
           required: ["accountName", "bankName", "accountNumber"],
           recommended: ["iban", "swiftBic"], tip: undefined },
};

const COUNTRY_LIST = [
  "SD", "SS", "KE", "ET", "UG", "EG", "JO", "AE",
  "GB", "US", "DE", "FR", "OTHER",
] as const;

// ── Schema ──────────────────────────────────────────────────────────────────
const bankakAccountSchema = z.object({
  country:       z.string().min(1, { message: "Please select a country" }),
  accountName:   z.string().min(3, { message: "Account holder name is required (min 3 characters)" }),
  bankName:      z.string().min(2, { message: "Bank name is required" }),
  accountNumber: z.string().min(1, { message: "Account number is required" })
    .regex(/^[\dA-Z\-\s]+$/i, { message: "Account number must contain only digits, letters, hyphens or spaces" }),
  branch:        z.string().optional(),
  currency:      z.string().optional(),
  iban:          z.string().optional(),
  swiftBic:      z.string().optional(),
  routingNumber: z.string().optional(),
});

export type BankakAccountFormValues = z.infer<typeof bankakAccountSchema>;

interface BankakAccountFormProps {
  onSubmit: (values: BankakAccountFormValues) => void;
  isSubmitting: boolean;
  existingDetails?: User['bankAccount'];
  isEditable?: boolean;
  currentUserRole?: string;
}

// ── Helper ───────────────────────────────────────────────────────────────────
function FieldBadge({ type }: { type: "required" | "recommended" }) {
  if (type === "required")
    return <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[10px] font-semibold">Required</Badge>;
  return <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">Recommended</Badge>;
}

export function BankakAccountForm({
  onSubmit,
  isSubmitting,
  existingDetails,
  isEditable = true,
  currentUserRole,
}: BankakAccountFormProps) {
  const canEditBankDetails =
    currentUserRole === "admin" ||
    currentUserRole === "superAdmin" ||
    currentUserRole === "ict" ||
    !existingDetails;

  const disabled = !canEditBankDetails || !isEditable;

  const form = useForm<BankakAccountFormValues>({
    resolver: zodResolver(bankakAccountSchema),
    defaultValues: {
      country:       existingDetails?.country       || "",
      accountName:   existingDetails?.accountName   || "",
      bankName:      existingDetails?.bankName      || "",
      accountNumber: existingDetails?.accountNumber || "",
      branch:        existingDetails?.branch        || "",
      currency:      existingDetails?.currency      || "",
      iban:          existingDetails?.iban          || "",
      swiftBic:      existingDetails?.swiftBic      || "",
      routingNumber: existingDetails?.routingNumber || "",
    },
  });

  const selectedCountry = useWatch({ control: form.control, name: "country" });
  const preset: CountryPreset | undefined = COUNTRY_PRESETS[selectedCountry];

  // Auto-fill currency when country changes
  useEffect(() => {
    if (preset?.currency && !form.getValues("currency")) {
      form.setValue("currency", preset.currency);
    }
  }, [selectedCountry]);

  const isRequired    = (field: string) => preset?.required.includes(field) ?? false;
  const isRecommended = (field: string) => !isRequired(field) && (preset?.recommended.includes(field) ?? false);

  const fieldLabel = (base: string, field: string) => (
    <span className="flex items-center">
      {base}
      {isRequired(field)    && <FieldBadge type="required" />}
      {isRecommended(field) && <FieldBadge type="recommended" />}
    </span>
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

        {/* ── Step 1: Country ─────────────────────────────────── */}
        <FormField
          control={form.control}
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country <span className="text-destructive">*</span></FormLabel>
              <Select
                onValueChange={val => { field.onChange(val); }}
                value={field.value}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-bank-country">
                    <SelectValue placeholder="Select country…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {COUNTRY_LIST.map(code => (
                    <SelectItem key={code} value={code}>
                      {COUNTRY_PRESETS[code].flag}&nbsp;&nbsp;{COUNTRY_PRESETS[code].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Country tip */}
        {preset?.tip && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            💡 {preset.tip}
          </div>
        )}

        {/* ── Core account details ─────────────────────────────── */}
        {selectedCountry && (
          <>
            <div className="border-t border-border/40 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Account Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{fieldLabel("Account Holder Name", "accountName")}</FormLabel>
                      <FormControl>
                        <Input placeholder="Full name as on the bank account" {...field} disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldLabel("Bank Name", "bankName")}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Bank of Khartoum" {...field} disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldLabel("Account Number", "accountNumber")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={preset?.accountNumberHint || "Enter account number"}
                          {...field}
                          disabled={disabled}
                          className="font-mono"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="branch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldLabel("Branch Name", "branch")}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Khartoum Main Branch" {...field} disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldLabel("Currency", "currency")}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. SDG, USD, EUR" {...field} disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── International banking ────────────────────────── */}
            <div className="border-t border-border/40 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">International Banking</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <FormField
                  control={form.control}
                  name="iban"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{fieldLabel("IBAN", "iban")}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. GB29 NWBK 6016 1331 9268 19" {...field} disabled={disabled} className="font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="swiftBic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldLabel("SWIFT / BIC Code", "swiftBic")}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. BARCGB22XXX" {...field} disabled={disabled} className="font-mono uppercase" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="routingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldLabel("Routing / Sort Code", "routingNumber")}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 026009593 or 20-00-00" {...field} disabled={disabled} className="font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </>
        )}

        {isEditable && (
          <Button
            type="submit"
            className="w-full mt-2"
            disabled={isSubmitting || (!!existingDetails && !canEditBankDetails)}
          >
            {isSubmitting ? "Saving…" : existingDetails ? "Update Bank Account" : "Register Account"}
          </Button>
        )}
      </form>
    </Form>
  );
}
