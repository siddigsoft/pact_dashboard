
import * as React from "react";
import { ToasterToast, ToastActionConfig } from "./types";
import { DEFAULT_DURATIONS, genId } from "./utils";
import { dispatch, memoryState, listeners } from "./toast-reducer";
import type { State } from "./types";
import { type ToastActionElement } from "@/components/ui/toast";

type Toast = Omit<ToasterToast, "id">;

function toast({ variant, duration, action, ...props }: Toast) {
  const id = genId();

  // Get base duration from the variant or default
  const toastDuration = duration || 
    (variant && DEFAULT_DURATIONS[variant]) || 
    DEFAULT_DURATIONS.default;

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    });
    
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  // Add default "View Details" action for validation results if none provided
  let finalAction = action;
  if (!finalAction && props.description && typeof props.description === 'string') {
    const descriptionStr = props.description.toString();
    const isValidationResult = 
      descriptionStr.includes('Validation completed') || 
      descriptionStr.includes('Critical issues:') || 
      descriptionStr.includes('Warnings:');
    
    if (isValidationResult) {
      // Create action configuration object (not a React element) that the toaster will handle
      finalAction = {
        altText: "View details",
        children: "View Details",
        onClick: () => {
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
          
          dismiss();
        }
      } as ToastActionConfig;
    }
  }

  // Adjust duration based on content complexity and type
  let adjustedDuration = toastDuration;
  
  if (props.description) {
    const descriptionStr = props.description.toString();
    
    // Check for validation results which need more time to read
    const isValidationResult = 
      descriptionStr.includes('Validation completed') || 
      descriptionStr.includes('Critical issues:') || 
      descriptionStr.includes('Warnings:');
      
    // Complex messages need more time - check length and content types
    const isComplex = 
      (typeof props.description === 'string' && props.description.length > 100) ||
      descriptionStr.includes('summary') ||
      isValidationResult;
      
    // For validation results or complex messages, especially warnings and errors, increase duration
    if (isComplex) {
      if (variant === 'warning' || variant === 'destructive') {
        adjustedDuration = Math.min(30000, toastDuration + 15000); // Add at least 15 seconds for complex messages
      } else {
        adjustedDuration = Math.min(25000, toastDuration + 10000); // Add at least 10 seconds for other complex messages
      }
      
      // Validation results with both errors and warnings need even more time
      if (isValidationResult && 
          descriptionStr.includes('Critical issues:') && 
          descriptionStr.includes('Warnings:')) {
        adjustedDuration = Math.min(45000, adjustedDuration + 15000);
      }
    }
  }

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      variant,
      action: finalAction,
      duration: adjustedDuration,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  // Don't auto-dismiss "important" toasts
  if (!props.important) {
    setTimeout(dismiss, adjustedDuration);
  }

  return {
    id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export { useToast, toast, type ToastActionConfig };
