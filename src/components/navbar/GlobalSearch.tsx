
import React, { useState, useEffect } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { 
  Search, 
  LayoutDashboard, 
  FolderOpenDot, 
  ClipboardList, 
  Database, 
  Users2, 
  Settings, 
  BarChart3 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const onSelect = (value: string) => {
    setOpen(false);
    navigate(value);
  };

  return (
    <div className="relative w-full max-w-sm lg:max-w-md mx-4">
      {/* <Button
        variant="outline"
        className="relative h-9 w-full justify-start text-sm text-neutral-500 dark:text-neutral-400 px-3 md:w-64 lg:w-80 
                   border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 
                   hover:bg-neutral-50 dark:hover:bg-neutral-800/70"
      >
        <Search className="mr-2 h-4 w-4 text-neutral-400" />
        <span className="hidden md:inline font-medium">Search projects, site visits...</span>
        <span className="inline md:hidden font-medium">Search...</span>
        <kbd className="pointer-events-none absolute right-2 hidden h-5 select-none items-center gap-1 
                       rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 
                       px-1.5 font-mono text-[10px] font-medium text-neutral-600 dark:text-neutral-400 md:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button> */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command className="rounded-lg border shadow-md">
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Quick Links" className="font-display">
              <CommandItem onSelect={() => onSelect('/dashboard')} className="flex items-center gap-2 py-3">
                <LayoutDashboard className="h-4 w-4 text-primary-500" />
                <span>Dashboard</span>
              </CommandItem>
              <CommandItem onSelect={() => onSelect('/projects')} className="flex items-center gap-2 py-3">
                <FolderOpenDot className="h-4 w-4 text-primary-500" />
                <span>Projects</span>
              </CommandItem>
              <CommandItem onSelect={() => onSelect('/site-visits')} className="flex items-center gap-2 py-3">
                <ClipboardList className="h-4 w-4 text-primary-500" />
                <span>Site Visits</span>
              </CommandItem>
              <CommandItem onSelect={() => onSelect('/mmp')} className="flex items-center gap-2 py-3">
                <Database className="h-4 w-4 text-primary-500" />
                <span>MMP Files</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Tools" className="font-display">
              <CommandItem onSelect={() => onSelect('/settings')} className="flex items-center gap-2 py-3">
                <Settings className="h-4 w-4 text-primary-500" />
                <span>Settings</span>
              </CommandItem>
              <CommandItem onSelect={() => onSelect('/users')} className="flex items-center gap-2 py-3">
                <Users2 className="h-4 w-4 text-primary-500" />
                <span>Team Members</span>
              </CommandItem>
              <CommandItem onSelect={() => onSelect('/reports')} className="flex items-center gap-2 py-3">
                <BarChart3 className="h-4 w-4 text-primary-500" />
                <span>Reports</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}
