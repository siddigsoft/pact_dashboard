
import { useToast } from "@/hooks/use-toast"
import { ToastActionConfig } from "@/hooks/toast/types"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToastAction,
  ToastIcon,
} from "@/components/ui/toast"
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react"
import * as React from "react"

// Function to check if an object is a ToastActionConfig
function isToastActionConfig(action: unknown): action is ToastActionConfig {
  return action !== null 
    && typeof action === 'object' 
    && 'onClick' in action 
    && 'children' in action 
    && 'altText' in action;
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        // Check if this is a validation result toast with multiple lines
        const isValidationResult = description && 
          typeof description === 'string' && 
          (description.includes('Validation completed') || description.includes('Critical issues:') || description.includes('Warnings:'));
        
        // Determine if we need a more compact layout for validation results
        const isCompactValidation = isValidationResult && description?.toString().split('\n').length > 3;
        
        return (
          <Toast 
            key={id} 
            {...props} 
            variant={variant} 
            className={`group flex flex-col gap-4 transform transition-all max-w-md mx-auto drop-shadow-2xl border-2 ${isCompactValidation ? 'max-h-[40vh]' : ''}`}
          >
            <div className="flex items-start gap-4 w-full">
              <ToastIcon variant={variant} />
              <div className="flex-1 flex flex-col gap-2">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription 
                    className={`${isCompactValidation ? 'max-h-[25vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-slate-400' : 'max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-slate-400'}`}
                  >
                    {isValidationResult ? (
                      <div className="space-y-2">
                        {description?.toString().split('\n').map((line, i) => {
                          // Add visual indicators for different types of content (monochrome)
                          if (line.includes('Critical issues:')) {
                            return <div key={i} className="font-semibold text-white flex items-center gap-1"><AlertTriangle size={14} />{line}</div>;
                          } else if (line.includes('Warnings:')) {
                            return <div key={i} className="font-semibold text-white/80 flex items-center gap-1"><AlertTriangle size={14} />{line}</div>;
                          } else if (line.startsWith('•')) {
                            return <div key={i} className="ml-1 text-white/70">{line}</div>;
                          } else if (line.includes('Validation completed successfully')) {
                            return <div key={i} className="flex items-center gap-1"><CheckCircle2 size={14} className="text-white" />{line}</div>;
                          } else {
                            return <div key={i}>{line}</div>;
                          }
                        })}
                      </div>
                    ) : (
                      description
                    )}
                  </ToastDescription>
                )}
              </div>
              <ToastClose />
            </div>
            {action && React.isValidElement(action) ? (
              // If action is a React element, render it directly
              <div className={`flex mt-2 sm:mt-0 ${isCompactValidation ? 'justify-center' : 'justify-end'}`}>
                {action}
              </div>
            ) : isToastActionConfig(action) ? (
              // If action is a ToastActionConfig object, create a ToastAction from it
              <div className={`flex mt-2 sm:mt-0 ${isCompactValidation ? 'justify-center' : 'justify-end'}`}>
                <ToastAction 
                  altText={action.altText} 
                  onClick={action.onClick}
                >
                  {action.children}
                </ToastAction>
              </div>
            ) : null}
            {isValidationResult && !action && (
              <div className="flex justify-center mt-2">
                <ToastAction altText="View details" className="flex items-center gap-1" onClick={() => {
                  // Add default action to scroll to validation results section
                  const validationResultsSection = document.getElementById('validation-results');
                  if (validationResultsSection) {
                    validationResultsSection.scrollIntoView({ behavior: 'smooth' });
                  }
                  
                  // For tabs-based validation results
                  const validationTab = document.querySelector('[data-tab="validation-results"]');
                  if (validationTab && validationTab instanceof HTMLElement) {
                    validationTab.click();
                  }
                }}>
                  <Eye size={14} />
                  View Details
                </ToastAction>
              </div>
            )}
          </Toast>
        )
      })}
      <ToastViewport position="top-center" />
    </ToastProvider>
  )
}
