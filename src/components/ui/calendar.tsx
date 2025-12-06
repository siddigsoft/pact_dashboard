import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 bg-background", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4 bg-white dark:bg-neutral-900",
        caption: "flex justify-center pt-1 relative items-center text-black dark:text-white",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "min-h-11 min-w-11 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1 bg-white dark:bg-neutral-900",
        head_row: "flex",
        head_cell:
          "text-black/60 dark:text-white/60 rounded-full w-11 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-11 w-11 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-full [&:has([aria-selected].day-outside)]:bg-black/10 dark:[&:has([aria-selected].day-outside)]:bg-white/10 [&:has([aria-selected])]:bg-black dark:[&:has([aria-selected])]:bg-white first:[&:has([aria-selected])]:rounded-l-full last:[&:has([aria-selected])]:rounded-r-full focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-11 w-11 p-0 font-normal aria-selected:opacity-100 rounded-full"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-black text-white dark:bg-white dark:text-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black",
        day_today: "bg-black/10 dark:bg-white/10 text-black dark:text-white",
        day_outside:
          "day-outside text-black/40 dark:text-white/40 opacity-50 aria-selected:bg-black/10 dark:aria-selected:bg-white/10 aria-selected:text-black/60 dark:aria-selected:text-white/60 aria-selected:opacity-30",
        day_disabled: "text-black/30 dark:text-white/30 opacity-50",
        day_range_middle:
          "aria-selected:bg-black/10 dark:aria-selected:bg-white/10 aria-selected:text-black dark:aria-selected:text-white",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
