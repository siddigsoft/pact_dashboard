
import * as React from "react";
import { ToastActionElement, ToastProps } from "@/components/ui/toast";

// Define a custom action configuration type that can be handled by the toaster
export type ToastActionConfig = {
  altText: string;
  children: React.ReactNode;
  onClick: () => void;
};

export type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement | ToastActionConfig;
  variant?: "default" | "success" | "destructive" | "warning" | "info" | "siddig";
  duration?: number;
  important?: boolean;
  onDismiss?: () => void; // Add the onDismiss property
};

export type State = {
  toasts: ToasterToast[];
};

// Re-add the Action type definition
export const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

type ActionType = typeof actionTypes;

export type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
    }
  | {
      type: ActionType["UPDATE_TOAST"];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    };
