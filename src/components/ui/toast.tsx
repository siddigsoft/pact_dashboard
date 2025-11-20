
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
  "group pointer-events-auto relative flex w-full items-center justify-between overflow-hidden rounded-lg border p-6 shadow-lg transition-all",
  {
    variants: {
      variant: {
        default: "border-slate-700 bg-slate-900/95 text-white font-medium shadow-xl backdrop-blur-md border-opacity-60",
        success: "border-green-700 bg-green-800 text-green-50 font-semibold shadow-xl",
        destructive: "border-red-700 bg-red-800 text-red-50 font-semibold shadow-xl",
        warning: "border-amber-700 bg-amber-800 text-amber-50 font-semibold shadow-xl",
        info: "border-blue-700 bg-blue-800 text-blue-50 font-semibold shadow-xl",
        siddig: "border-slate-700 bg-slate-900/95 text-white font-medium shadow-xl backdrop-blur-md border-opacity-60",
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
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
      "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
      "group-[.success]:bg-green-500 group-[.success]:text-white group-[.success]:hover:bg-green-600",
      "group-[.destructive]:bg-red-500 group-[.destructive]:text-white group-[.destructive]:hover:bg-red-600",
      "group-[.warning]:bg-amber-500 group-[.warning]:text-white group-[.warning]:hover:bg-amber-600",
      "group-[.info]:bg-blue-500 group-[.info]:text-white group-[.info]:hover:bg-blue-600",
      "mt-2 sm:mt-0 cursor-pointer", // Added cursor-pointer for better UX
      className
    )}
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
      "absolute right-1 top-1 rounded-md p-1 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100",
      "text-gray-300 hover:text-white",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
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
