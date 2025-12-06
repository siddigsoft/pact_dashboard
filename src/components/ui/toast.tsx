
import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const viewportVariants = cva(
  "fixed z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4",
  {
    variants: {
      position: {
        'top-right': 'top-0 right-0 md:max-w-[420px] md:right-4 md:top-4',
        'top-center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:max-w-[420px]',
        'bottom-right': 'bottom-0 right-0 md:max-w-[420px]',
        'bottom-left': 'bottom-0 left-0 md:max-w-[420px]',
        'top-left': 'top-0 left-0 md:max-w-[420px]',
      },
    },
    defaultVariants: {
      position: 'top-center',
    },
  }
)

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport> & 
  VariantProps<typeof viewportVariants>
>(({ className, position, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(viewportVariants({ position }), className)}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between overflow-hidden rounded-2xl border p-6 shadow-xl transition-all backdrop-blur-md",
  {
    variants: {
      variant: {
        default: "border-white/20 bg-black/95 text-white font-medium",
        success: "border-white/20 bg-black/95 text-white font-semibold",
        destructive: "border-white/30 bg-black text-white font-semibold",
        warning: "border-white/20 bg-black/90 text-white font-semibold",
        info: "border-white/20 bg-black/95 text-white font-medium",
        siddig: "border-white/20 bg-black/95 text-white font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(
        toastVariants({ variant }),
        "data-[state=open]:animate-scale-in-center",
        "data-[state=closed]:animate-scale-out-center",
        "transform transition-all duration-500 ease-in-out",
        "origin-center",
        className
      )}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastIcon = ({ variant }: { variant?: "default" | "success" | "destructive" | "warning" | "info" | "siddig" }) => {
  const icons = {
    default: <Info className="h-6 w-6 text-white" />,
    success: <CheckCircle2 className="h-6 w-6 text-white" />,
    destructive: <AlertCircle className="h-6 w-6 text-white" />,
    warning: <AlertTriangle className="h-6 w-6 text-white" />,
    info: <Info className="h-6 w-6 text-white" />,
    siddig: <Info className="h-6 w-6 text-white" />
  }
  return icons[variant || "default"]
}

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action> & { "data-testid"?: string; "aria-label"?: string }
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex min-h-11 min-w-[88px] shrink-0 items-center justify-center rounded-full border px-5 text-sm font-medium transition-all duration-200",
      "border-white/30 bg-white text-black hover:bg-white/90 active:scale-[0.98]",
      "mt-2 sm:mt-0 cursor-pointer",
      className
    )}
    data-testid={props["data-testid"] || "button-toast-action"}
    aria-label={props["aria-label"] || "Toast action"}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-full min-h-11 min-w-11 flex items-center justify-center opacity-0 transition-all duration-200 hover:opacity-100 hover:bg-white/10 focus:opacity-100 group-hover:opacity-100",
      "text-white/70 hover:text-white",
      className
    )}
    toast-close=""
    data-testid="button-toast-close"
    aria-label="Close notification"
    {...props}
  >
    <X className="h-5 w-5" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-base font-semibold leading-none tracking-tight text-white", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm font-medium text-white/90 mt-1 max-h-[40vh] overflow-y-auto", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
  ToastIcon,
}
