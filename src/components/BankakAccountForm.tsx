import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { User } from "@/types";

const bankakAccountSchema = z.object({
  accountName: z.string().min(3, { message: "Account holder name is required (min 3 characters)" }),
  bankName:    z.string().min(2, { message: "Bank name is required" }),
  accountNumber: z.string().min(1, { message: "Account number is required" })
    .regex(/^[\dA-Z\-\s]+$/i, { message: "Account number must contain only digits, letters, hyphens or spaces" }),
  branch:        z.string().optional(),
  iban:          z.string().optional(),
  swiftBic:      z.string().optional(),
  country:       z.string().optional(),
  currency:      z.string().optional(),
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
      accountName:   existingDetails?.accountName   || "",
      bankName:      existingDetails?.bankName      || "",
      accountNumber: existingDetails?.accountNumber || "",
      branch:        existingDetails?.branch        || "",
      iban:          existingDetails?.iban          || "",
      swiftBic:      existingDetails?.swiftBic      || "",
      country:       existingDetails?.country       || "",
      currency:      existingDetails?.currency      || "",
      routingNumber: existingDetails?.routingNumber || "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

        {/* ── Core account details ─────────────────────────────── */}
        <div className="space-y-1 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Account Details</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="accountName"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Account Holder Name <span className="text-destructive">*</span></FormLabel>
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
                <FormLabel>Bank Name <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Bank of Khartoum, Barclays" {...field} disabled={disabled} />
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
                <FormLabel>Account Number <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="Enter account number" {...field} disabled={disabled} className="font-mono" />
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
                <FormLabel>Branch Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Khartoum Main Branch" {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Sudan, Kenya, UK" {...field} disabled={disabled} />
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
                <FormLabel>Currency</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. SDG, USD, EUR, KES" {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* ── International / Correspondent banking ───────────── */}
        <div className="space-y-1 pt-2 pb-1 border-t border-border/50">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">International Banking (optional)</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="iban"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>IBAN</FormLabel>
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
                <FormLabel>SWIFT / BIC Code</FormLabel>
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
                <FormLabel>Routing / Sort Code</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. 026009593 or 20-00-00" {...field} disabled={disabled} className="font-mono" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
