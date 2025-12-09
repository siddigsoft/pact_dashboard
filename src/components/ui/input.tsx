import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex min-h-11 w-full rounded-xl border border-black/20 dark:border-white/20 bg-white dark:bg-neutral-900 px-4 py-2 text-base text-black dark:text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-black dark:file:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20 focus-visible:border-black dark:focus-visible:border-white disabled:cursor-not-allowed disabled:opacity-50 transition-colors md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
