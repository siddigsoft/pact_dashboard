import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-black dark:data-[state=checked]:bg-white",
      "data-[state=unchecked]:bg-black/20 dark:data-[state=unchecked]:bg-white/20",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0",
        "transition-all duration-300 ease-out",
        "data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-0.5",
        "data-[state=checked]:bg-white dark:data-[state=checked]:bg-black",
        "data-[state=unchecked]:bg-white dark:data-[state=unchecked]:bg-white",
        "data-[state=checked]:scale-100 data-[state=unchecked]:scale-95"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
