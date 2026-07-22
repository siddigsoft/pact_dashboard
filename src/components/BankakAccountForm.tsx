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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "@/types";
import { Building2, CreditCard, Globe, Info, Save, CheckCircle2 } from "lucide-react";

// ── Major international currencies always shown in the dropdown ──────────────
const MAJOR_CURRENCIES = [
  { code: "USD", label: "US Dollar",      flag: "🇺🇸" },
  { code: "EUR", label: "Euro",           flag: "🇪🇺" },
  { code: "GBP", label: "British Pound",  flag: "🇬🇧" },
  { code: "CHF", label: "Swiss Franc",    flag: "🇨🇭" },
  { code: "JPY", label: "Japanese Yen",   flag: "🇯🇵" },
];

// Local-currency names for display in the dropdown
const CURRENCY_LABELS: Record<string, string> = {
  SDG: "Sudanese Pound", SSP: "South Sudanese Pound", KES: "Kenyan Shilling",
  ETB: "Ethiopian Birr",  UGX: "Ugandan Shilling",    EGP: "Egyptian Pound",
  JOD: "Jordanian Dinar", AED: "UAE Dirham",           GBP: "British Pound",
  USD: "US Dollar",       EUR: "Euro",                 CHF: "Swiss Franc",
  JPY: "Japanese Yen",    QAR: "Qatari Riyal",          SAR: "Saudi Riyal",
};

function getCurrencyOptions(
  countryCode: string,
  preset: CountryPreset | undefined
): { code: string; label: string; flag: string }[] {
  const local = preset?.currency;
  const opts: { code: string; label: string; flag: string }[] = [];

  // 1. Local currency first (if it has one and is not already a major)
  if (local && !MAJOR_CURRENCIES.some(m => m.code === local)) {
    opts.push({
      code: local,
      label: CURRENCY_LABELS[local] ?? local,
      flag: preset!.flag,
    });
  }

  // 2. Add the top 4 major currencies (USD, EUR, GBP, CHF)
  //    If local IS one of them, put it first naturally by showing it via the
  //    major list — deduplicate by filtering.
  for (const m of MAJOR_CURRENCIES) {
    if (opts.length >= 4) break; // cap at 4 total options
    if (!opts.some(o => o.code === m.code)) opts.push(m);
  }

  return opts;
}

// ── Country presets ──────────────────────────────────────────────────────────
interface CountryPreset {
  label: string;
  flag: string;
  currency: string;
  accountNumberHint: string;
  required: string[];
  recommended: string[];
  mode: "simple" | "full";
  tip?: string;
  accountNumberMaxLength?: number;
}

const COUNTRY_PRESETS: Record<string, CountryPreset> = {
  SD: {
    label: "Sudan", flag: "🇸🇩", currency: "SDG",
    accountNumberHint: "e.g. 1234567",
    required: ["accountName", "bankName", "accountNumber", "branch"],
    recommended: [],
    mode: "simple",
    accountNumberMaxLength: 7,
    tip: "Sudanese accounts use exactly 7-digit account numbers.",
  },
  SS: {
    label: "South Sudan", flag: "🇸🇸", currency: "SSP",
    accountNumberHint: "Enter account number",
    required: ["accountName", "bankName", "accountNumber"],
    recommended: ["branch", "swiftBic"],
    mode: "full",
  },
  KE: {
    label: "Kenya", flag: "🇰🇪", currency: "KES",
    accountNumberHint: "e.g. 0123456789",
    required: ["accountName", "bankName", "accountNumber"],
    recommended: ["branch", "swiftBic"],
    mode: "full",
    tip: "Kenyan banks typically use 10–14 digit account numbers.",
  },
  ET: {
    label: "Ethiopia", flag: "🇪🇹", currency: "ETB",
    accountNumberHint: "Enter account number",
    required: ["accountName", "bankName", "accountNumber"],
    recommended: ["branch", "swiftBic"],
    mode: "full",
  },
  UG: {
    label: "Uganda", flag: "🇺🇬", currency: "UGX",
    accountNumberHint: "Enter account number",
    required: ["accountName", "bankName", "accountNumber"],
    recommended: ["branch", "swiftBic"],
    mode: "full",
  },
  EG: {
    label: "Egypt", flag: "🇪🇬", currency: "EGP",
    accountNumberHint: "e.g. 000012345678901",
    required: ["accountName", "bankName", "accountNumber"],
    recommended: ["iban", "swiftBic"],
    mode: "full",
    tip: "Egyptian banks increasingly support IBAN for international transfers.",
  },
  JO: {
    label: "Jordan", flag: "🇯🇴", currency: "JOD",
    accountNumberHint: "Enter account number",
    required: ["accountName", "bankName", "accountNumber", "iban"],
    recommended: ["swiftBic"],
    mode: "full",
    tip: "IBAN is required for international transfers from Jordanian banks.",
  },
  AE: {
    label: "UAE", flag: "🇦🇪", currency: "AED",
    accountNumberHint: "Enter account number",
    required: ["accountName", "bankName", "accountNumber", "iban", "swiftBic"],
    recommended: [],
    mode: "full",
    tip: "UAE banks require IBAN and SWIFT/BIC for all transfers.",
  },
  GB: {
    label: "United Kingdom", flag: "🇬🇧", currency: "GBP",
    accountNumberHint: "e.g. 12345678 (8 digits)",
    required: ["accountName", "bankName", "accountNumber", "routingNumber"],
    recommended: ["iban", "swiftBic"],
    mode: "full",
    tip: "UK accounts need a Sort Code (routing) and 8-digit account number.",
  },
  US: {
    label: "United States", flag: "🇺🇸", currency: "USD",
    accountNumberHint: "Enter account number",
    required: ["accountName", "bankName", "accountNumber", "routingNumber"],
    recommended: [],
    mode: "full",
    tip: "US banks require a 9-digit ABA Routing Number alongside the account number.",
  },
  DE: {
    label: "Germany", flag: "🇩🇪", currency: "EUR",
    accountNumberHint: "Enter account number",
    required: ["accountName", "bankName", "accountNumber", "iban", "swiftBic"],
    recommended: [],
    mode: "full",
    tip: "German banks require IBAN and BIC. IBAN starts with DE.",
  },
  FR: {
    label: "France", flag: "🇫🇷", currency: "EUR",
    accountNumberHint: "Enter account number",
    required: ["accountName", "bankName", "accountNumber", "iban", "swiftBic"],
    recommended: [],
    mode: "full",
    tip: "French IBANs start with FR and are required for all SEPA transfers.",
  },
  OTHER: {
    label: "Other country", flag: "🌍", currency: "",
    accountNumberHint: "Enter account number",
    required: ["accountName", "bankName", "accountNumber"],
    recommended: ["iban", "swiftBic"],
    mode: "full",
  },
};

const COUNTRY_LIST = [
  "SD","SS","KE","ET","UG","EG","JO","AE","GB","US","DE","FR","OTHER",
] as const;

// ── Schema ───────────────────────────────────────────────────────────────────
const bankakAccountSchema = z.object({
  country:       z.string().min(1, { message: "Please select a country" }),
  accountName:   z.string().min(3, { message: "Account holder name is required" }),
  bankName:      z.string().min(2, { message: "Bank name is required" }),
  accountNumber: z.string().min(1, { message: "Account number is required" })
    .regex(/^[\dA-Z\-\s]+$/i, { message: "Letters, digits, hyphens and spaces only" }),
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

function FieldTag({ type }: { type: "required" | "recommended" }) {
  if (type === "required")
    return (
      <span className="ml-1.5 inline-flex items-center rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide">
        Required
      </span>
    );
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide">
      Recommended
    </span>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
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
  const preset = COUNTRY_PRESETS[selectedCountry];
  const isSimple = preset?.mode === "simple";

  // When the country changes, always reset the currency to that country's default.
  // This fixes the bug where switching from e.g. Ethiopia to Uganda kept "ETB".
  useEffect(() => {
    if (!preset) return;
    if (!isSimple && preset.currency) {
      form.setValue("currency", preset.currency);
    } else if (!isSimple && !preset.currency) {
      form.setValue("currency", "USD"); // fallback for "Other" with no local currency
    }
  }, [selectedCountry]);

  const isReq = (f: string) => preset?.required.includes(f) ?? false;
  const isRec = (f: string) => !isReq(f) && (preset?.recommended.includes(f) ?? false);
  const lbl   = (text: string, field: string) => (
    <span className="flex items-center">
      {text}
      {isReq(field) && <FieldTag type="required" />}
      {isRec(field) && <FieldTag type="recommended" />}
    </span>
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Country selector ─────────────────────────────────── */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
          <SectionHeader icon={Globe} label="Banking Country" />
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-muted-foreground sr-only">Country</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={disabled}>
                  <FormControl>
                    <SelectTrigger
                      data-testid="select-bank-country"
                      className="h-11 bg-background border-border/60 hover:border-border focus:border-primary transition-colors"
                    >
                      {field.value && COUNTRY_PRESETS[field.value] ? (
                        <span className="flex items-center gap-2.5">
                          <span className="text-2xl leading-none">{COUNTRY_PRESETS[field.value].flag}</span>
                          <span className="font-medium">{COUNTRY_PRESETS[field.value].label}</span>
                          {COUNTRY_PRESETS[field.value].currency && (
                            <span className="ml-auto mr-2 text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {COUNTRY_PRESETS[field.value].currency}
                            </span>
                          )}
                        </span>
                      ) : (
                        <SelectValue placeholder="Select the account's country…" />
                      )}
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COUNTRY_LIST.map(code => (
                      <SelectItem key={code} value={code} className="cursor-pointer">
                        <span className="flex items-center gap-2.5">
                          <span className="text-xl leading-none">{COUNTRY_PRESETS[code].flag}</span>
                          <span className="font-medium">{COUNTRY_PRESETS[code].label}</span>
                          {COUNTRY_PRESETS[code].currency && (
                            <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                              {COUNTRY_PRESETS[code].currency}
                            </span>
                          )}
                        </span>
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
            <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 px-3.5 py-2.5">
              <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{preset.tip}</p>
            </div>
          )}
        </div>

        {/* ── Fields appear after country is chosen ────────────── */}
        {selectedCountry && (
          <>
            {/* Account Details section */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-4">
              <SectionHeader icon={Building2} label="Account Details" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Account Holder Name — full width */}
                <FormField control={form.control} name="accountName" render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-xs font-semibold">{lbl("Account Holder Name", "accountName")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Full legal name as on the bank account"
                        className="h-10 bg-background border-border/60 focus:border-primary"
                        {...field} disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Bank Name */}
                <FormField control={form.control} name="bankName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">{lbl("Bank Name", "bankName")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Bank of Khartoum"
                        className="h-10 bg-background border-border/60 focus:border-primary"
                        {...field} disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Account Number */}
                <FormField control={form.control} name="accountNumber" render={({ field }) => {
                  const maxLen = preset?.accountNumberMaxLength;
                  const curLen = (field.value || "").length;
                  const overLimit = maxLen !== undefined && curLen > maxLen;
                  return (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">
                        <span className="flex items-center justify-between w-full">
                          {lbl("Account Number", "accountNumber")}
                          {maxLen !== undefined && (
                            <span className={`text-[10px] font-mono ml-2 ${overLimit ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                              {curLen}/{maxLen}
                            </span>
                          )}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={preset?.accountNumberHint || "Enter account number"}
                          className={`h-10 bg-background border-border/60 focus:border-primary font-mono tracking-wider ${overLimit ? "border-destructive focus:border-destructive" : ""}`}
                          maxLength={maxLen}
                          {...field} disabled={disabled}
                        />
                      </FormControl>
                      {overLimit && (
                        <p className="text-[11px] text-destructive">Sudan account numbers must be exactly {maxLen} digits.</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }} />

                {/* Branch */}
                <FormField control={form.control} name="branch" render={({ field }) => (
                  <FormItem className={isSimple ? "sm:col-span-2" : ""}>
                    <FormLabel className="text-xs font-semibold">{lbl("Branch Name", "branch")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Khartoum Main Branch"
                        className="h-10 bg-background border-border/60 focus:border-primary"
                        {...field} disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Currency — full-mode only, dropdown with local + 3 majors */}
                {!isSimple && (
                  <FormField control={form.control} name="currency" render={({ field }) => {
                    const currencyOpts = getCurrencyOptions(selectedCountry, preset);
                    return (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">{lbl("Currency", "currency")}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ""}
                          disabled={disabled}
                        >
                          <FormControl>
                            <SelectTrigger
                              data-testid="select-bank-currency"
                              className="h-10 bg-background border-border/60 focus:border-primary"
                            >
                              <SelectValue placeholder="Select currency…" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {currencyOpts.map(opt => (
                              <SelectItem key={opt.code} value={opt.code}>
                                <span className="flex items-center gap-2">
                                  <span className="text-base leading-none">{opt.flag}</span>
                                  <span className="font-mono font-semibold text-xs">{opt.code}</span>
                                  <span className="text-xs text-muted-foreground">{opt.label}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                )}
              </div>
            </div>

            {/* ── International Banking — full-mode only ────────── */}
            {!isSimple && (
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-4">
                <SectionHeader icon={CreditCard} label="International Banking" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* IBAN — full width */}
                  <FormField control={form.control} name="iban" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel className="text-xs font-semibold">{lbl("IBAN", "iban")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. GB29 NWBK 6016 1331 9268 19"
                          className="h-10 bg-background border-border/60 focus:border-primary font-mono tracking-widest"
                          {...field} disabled={disabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* SWIFT / BIC */}
                  <FormField control={form.control} name="swiftBic" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">{lbl("SWIFT / BIC Code", "swiftBic")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. BARCGB22XXX"
                          className="h-10 bg-background border-border/60 focus:border-primary font-mono uppercase tracking-wider"
                          {...field} disabled={disabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Routing / Sort Code */}
                  <FormField control={form.control} name="routingNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">{lbl("Routing / Sort Code", "routingNumber")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. 026009593 or 20-00-00"
                          className="h-10 bg-background border-border/60 focus:border-primary font-mono"
                          {...field} disabled={disabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Submit ─────────────────────────────────────────────── */}
        {isEditable && (
          <Button
            type="submit"
            className="w-full h-11 gap-2 font-semibold text-sm"
            disabled={isSubmitting || (!!existingDetails && !canEditBankDetails) || !selectedCountry}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                Saving…
              </>
            ) : existingDetails ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Update Bank Account
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Register Account
              </>
            )}
          </Button>
        )}
      </form>
    </Form>
  );
}
