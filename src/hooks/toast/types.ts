
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
  /**
   * Toast visibility scope:
   * - 'route' (default): only visible on matching route/user
   * - 'global': visible regardless of route/user
   */
  visibilityScope?: "route" | "global";
  /** Intended recipient user ID. Undefined means no user restriction. */
  targetUserId?: string;
  /** Route(s) where this toast is allowed to render. */
  routeScope?: string[];
  /** Match route exactly when true; prefix match when false. */
  routeMatchExact?: boolean;
  /** Route at creation time (auto-populated by toast()). */
  createdAtRoute?: string;
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
