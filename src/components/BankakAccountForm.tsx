
import React from "react";
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
  accountName: z
    .string()
    .min(3, { message: "Account name must be at least 3 characters long" }),
  branch: z
    .string()
    .min(2, { message: "Branch name is required" }),
  accountNumber: z
    .string()
    .length(7, { message: "Account number must be exactly 7 digits" })
    .regex(/^\d+$/, { message: "Account number must contain only digits" }),
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
  currentUserRole
}: BankakAccountFormProps) {
  // Fixed the condition here - only admins and ICT can edit existing bank details
  const canEditBankDetails = 
    currentUserRole === "admin" || 
    currentUserRole === "ict" || 
    !existingDetails;
  
  const form = useForm<BankakAccountFormValues>({
    resolver: zodResolver(bankakAccountSchema),
    defaultValues: {
      accountName: existingDetails?.accountName || "",
      branch: existingDetails?.branch || "",
      accountNumber: existingDetails?.accountNumber || "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="accountName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Full Name</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Enter your full name as it appears on your account" 
                  {...field} 
                  disabled={!canEditBankDetails || !isEditable}
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
              <FormLabel>Branch Name</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Enter your bank branch name" 
                  {...field} 
                  disabled={!canEditBankDetails || !isEditable}
                />
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
              <FormLabel>Account Number (7 digits)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter your 7 digit account number"
                  maxLength={7}
                  {...field}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d]/g, "");
                    e.target.value = value;
                    field.onChange(value);
                  }}
                  disabled={
                    !canEditBankDetails || 
                    (existingDetails && !canEditBankDetails) || 
                    !isEditable
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isEditable && (
          <Button 
            type="submit" 
            className="w-full" 
            disabled={isSubmitting || (existingDetails && !canEditBankDetails)}
          >
            {isSubmitting ? "Processing..." : existingDetails ? "Update Account" : "Register Account"}
          </Button>
        )}
      </form>
    </Form>
  );
}
