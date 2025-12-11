
import { z } from "zod";
import { Project, ProjectType, ProjectStatus } from "@/types/project";

// Validation schema for budget - allows null, undefined, empty object, or complete budget object
const completeBudgetSchema = z.object({
  total: z.number().min(0),
  currency: z.string().min(1),
  allocated: z.number().min(0),
  remaining: z.number().min(0)
}).refine(data => data.allocated + data.remaining <= data.total, {
  message: "Allocated and remaining amounts must not exceed total budget"
});

// Budget can be: null, undefined, empty object (treated as null), or a complete budget
const budgetSchema = z.union([
  completeBudgetSchema,
  z.null(),
  z.undefined(),
  z.object({}).transform(() => null) // empty object becomes null
]);

// Validation schema for location
const locationSchema = z.object({
  country: z.string().min(1),
  region: z.string(),
  state: z.string(),
  selectedStates: z.array(z.string()).optional(),
  locality: z.string().optional(),
  coordinates: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional()
  }).optional()
});

// Main project validation schema
export const projectValidationSchema = z.object({
  name: z.string().min(3, "Project name must be at least 3 characters"),
  projectCode: z.string().min(1, "Project code is required"),
  description: z.string().optional(),
  projectType: z.enum(["infrastructure", "survey", "compliance", "monitoring", "training", "other"] as const),
  status: z.enum(["draft", "active", "onHold", "completed", "cancelled"] as const),
  startDate: z.string().refine(date => !isNaN(Date.parse(date)), {
    message: "Invalid start date format"
  }),
  endDate: z.string().refine(date => !isNaN(Date.parse(date)), {
    message: "Invalid end date format"
  }),
  budget: budgetSchema,
  location: locationSchema,
  team: z.object({
    projectManager: z.string().optional(),
    members: z.array(z.string()).optional(),
    teamComposition: z.array(z.object({
      userId: z.string(),
      name: z.string(),
      role: z.string(),
      joinedAt: z.string(),
      workload: z.number().min(0).max(100).optional()
    })).optional()
  }).optional()
});

export type ValidationResult = {
  success: boolean;
  errors?: string[];
  data?: Partial<Project>;
};

export function validateProject(project: Partial<Project>): ValidationResult {
  try {
    const validatedData = projectValidationSchema.parse(project);
    
    // Additional business logic validations
    const errors: string[] = [];
    
    if (validatedData.startDate && validatedData.endDate) {
      const startDate = new Date(validatedData.startDate);
      const endDate = new Date(validatedData.endDate);
      
      if (endDate <= startDate) {
        errors.push("End date must be after start date");
      }
    }
    
    if (validatedData.budget) {
      if (validatedData.budget.allocated > validatedData.budget.total) {
        errors.push("Allocated budget cannot exceed total budget");
      }
    }
    
    if (errors.length > 0) {
      return { success: false, errors };
    }
    
    return { 
      success: true, 
      data: validatedData as Partial<Project>
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return {
      success: false,
      errors: ['An unexpected validation error occurred']
    };
  }
}
