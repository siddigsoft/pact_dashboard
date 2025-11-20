
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import React from "react"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const dynamic = (importFn: () => Promise<any>, options?: { ssr?: boolean; loading?: () => JSX.Element }) => {
  const DynamicComponent = React.lazy(importFn);
  
  return function DynamicWithLoading(props: any) {
    // Use createElement instead of JSX since we're in a .ts file
    return React.createElement(
      React.Suspense,
      { fallback: options?.loading ? options.loading() : null },
      React.createElement(DynamicComponent, props)
    );
  };
};
