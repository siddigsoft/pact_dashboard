import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

interface AnimatedSwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  variant?: 'default' | 'success' | 'warning' | 'premium'
}

const AnimatedSwitch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  AnimatedSwitchProps
>(({ className, variant = 'default', ...props }, ref) => {
  const variantStyles = {
    default: 'data-[state=checked]:bg-primary',
    success: 'data-[state=checked]:bg-emerald-500',
    warning: 'data-[state=checked]:bg-amber-500',
    premium: 'data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-violet-500 data-[state=checked]:to-purple-600'
  }

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full",
        "border-2 border-transparent shadow-inner",
        "transition-all duration-300 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=unchecked]:bg-muted data-[state=unchecked]:dark:bg-muted/60",
        variantStyles[variant],
        "data-[state=checked]:shadow-lg",
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md ring-0",
          "transition-all duration-300 ease-in-out",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5",
          "data-[state=checked]:shadow-lg",
          "before:absolute before:inset-0 before:rounded-full",
          "before:transition-opacity before:duration-300",
          "data-[state=checked]:before:bg-white/20 data-[state=checked]:before:opacity-100",
          "data-[state=unchecked]:before:opacity-0"
        )}
      />
      <span 
        className={cn(
          "absolute inset-0 rounded-full opacity-0 transition-opacity duration-300",
          "data-[state=checked]:opacity-100",
          "bg-gradient-to-r from-transparent via-white/10 to-transparent"
        )}
        aria-hidden="true"
      />
    </SwitchPrimitives.Root>
  )
})
AnimatedSwitch.displayName = "AnimatedSwitch"

export { AnimatedSwitch }
