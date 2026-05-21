import * as React from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

/** Space for left-3 (12px) + 16px icon + 12px gap */
export const ICON_INPUT_PADDING_LEFT = "!pl-11"
/** Space for right icon or native date/time picker */
export const ICON_INPUT_PADDING_RIGHT = "!pr-11"

const iconSlotClass =
  "pointer-events-none absolute top-1/2 z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4 shrink-0"

export interface IconInputProps extends React.ComponentProps<typeof Input> {
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  wrapperClassName?: string
}

/**
 * Input with prefix/suffix icons. Uses !important padding so it always wins over
 * base Input pl-4/pr-4 (tailwind-merge does not strip px-* when adding pl-*).
 */
const IconInput = React.forwardRef<HTMLInputElement, IconInputProps>(
  ({ leftIcon, rightIcon, className, wrapperClassName, type, style, ...props }, ref) => {
    const hasLeft = Boolean(leftIcon)
    const hasRight = Boolean(rightIcon)
    const isDate = type === "date" || type === "datetime-local" || type === "time"

    return (
      <div
        data-icon-input=""
        data-has-left-icon={hasLeft ? "" : undefined}
        data-has-right-icon={hasRight || isDate ? "" : undefined}
        data-type={type}
        className={cn("relative w-full", wrapperClassName)}
      >
        {hasLeft && (
          <span className={cn(iconSlotClass, "left-3")} aria-hidden="true">
            {leftIcon}
          </span>
        )}
        {hasRight && (
          <span className={cn(iconSlotClass, "right-3")} aria-hidden="true">
            {rightIcon}
          </span>
        )}
        <Input
          ref={ref}
          type={type}
          className={cn(
            "icon-input-field",
            hasLeft && ICON_INPUT_PADDING_LEFT,
            (hasRight || isDate) && ICON_INPUT_PADDING_RIGHT,
            isDate && "icon-input-field--date",
            className
          )}
          style={style}
          {...props}
        />
      </div>
    )
  }
)
IconInput.displayName = "IconInput"

export { IconInput }
