
import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User } from "lucide-react";

interface PersonalInformationFormProps {
  formData: {
    name: string;
    email: string;
    phone: string;
    employeeId: string;
  };
  errors: Record<string, string>;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  role: string;
}

const PersonalInformationForm = ({
  formData,
  errors,
  handleChange,
  role
}: PersonalInformationFormProps) => {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <User className="h-5 w-5" />
        Personal Information
      </h3>
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">
            Full Name<span className="text-red-500 ml-1">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            placeholder="Enter your full name"
            value={formData.name}
            onChange={handleChange}
            className={errors.name ? "border-red-500" : ""}
          />
          {errors.name && (
            <p className="text-xs text-red-500">{errors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">
            Email<span className="text-red-500 ml-1">*</span>
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="Enter your email"
            value={formData.email}
            onChange={handleChange}
            className={errors.email ? "border-red-500" : ""}
          />
          {errors.email && (
            <p className="text-xs text-red-500">{errors.email}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone Number
              {(role === 'dataCollector' || role === 'coordinator') && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </Label>
            <Input
              id="phone"
              name="phone"
              placeholder="Enter your phone number"
              value={formData.phone}
              onChange={handleChange}
              className={errors.phone ? "border-red-500" : ""}
            />
            {errors.phone && (
              <p className="text-xs text-red-500">{errors.phone}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="employeeId">Employee ID (Optional)</Label>
            <Input
              id="employeeId"
              name="employeeId"
              placeholder="Enter your employee ID"
              value={formData.employeeId}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonalInformationForm;
