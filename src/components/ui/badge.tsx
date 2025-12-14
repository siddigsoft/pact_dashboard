
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-black dark:bg-white text-white dark:text-black",
        secondary:
          "border-transparent bg-black/10 dark:bg-white/10 text-black dark:text-white",
        destructive:
          "border-2 border-black dark:border-white bg-transparent text-black dark:text-white",
        outline: "border border-black/20 dark:border-white/20 text-black dark:text-white bg-transparent",
        success: 
          "border-transparent bg-black dark:bg-white text-white dark:text-black",
        warning:
          "border-transparent bg-black/20 dark:bg-white/20 text-black dark:text-white",
        info:
          "border-transparent bg-black/5 dark:bg-white/5 text-black dark:text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
