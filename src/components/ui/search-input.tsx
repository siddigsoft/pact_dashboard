import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { IconInput, type IconInputProps } from "@/components/ui/icon-input"

export interface SearchInputProps extends Omit<IconInputProps, "leftIcon"> {
  type?: "search" | "text"
}

/**
 * Standard search field with a leading magnifying glass.
 * Prefer this over hand-rolled relative + absolute Search + Input + pl-8/pl-9.
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ type = "search", className, ...props }, ref) => (
    <IconInput
      ref={ref}
      type={type}
      leftIcon={<Search />}
      className={cn(className)}
      {...props}
    />
  )
)
SearchInput.displayName = "SearchInput"

export { SearchInput }
