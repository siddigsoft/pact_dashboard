import { driver, type DriveStep } from 'driver.js';

/**
 * First-run product tour for the Workspace Hub. Anchored to real elements
 * (by id) already in WorkspaceHub.tsx — see the `id="tour-…"` attributes.
 * Steps whose element isn't present for this user/session (e.g. "New folder"
 * for non-admins) are dropped rather than shown pointing at nothing.
 */

interface TourFlags {
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const ALL_STEPS: (DriveStep & { requires?: (f: TourFlags) => boolean })[] = [
  {
    popover: {
      title: 'Welcome to the Workspace',
      description: "This is where PACT's shared files and folders live. Quick tour — six stops, about a minute.",
    },
  },
  {
    element: '#tour-kpi-tiles',
    popover: {
      title: 'Jump straight to what you need',
      description: 'Each tile is a shortcut: click "Starred" for pinned files, "My Files" for what you uploaded. Click a tile again to return to All Files.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-upload-btn',
    popover: {
      title: 'Upload files or whole folders',
      description: 'Click here, or just drag files onto the page. Folder structures are recreated automatically, and every upload gets a security level.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-search-bar',
    popover: {
      title: 'Search and filter',
      description: 'Search by file name, then narrow further with the security-level filter next to it.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-view-toggle',
    popover: {
      title: 'List or grid',
      description: 'Switch to grid view for thumbnails, or stay in list view for full detail — size, modified date, and status at a glance.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-folders',
    popover: {
      title: 'Folders, on the left',
      description: 'Nested folders live here. Drag any file onto a folder to move it.',
      side: 'right',
    },
  },
  {
    element: '#tour-new-folder',
    requires: f => f.isAdmin,
    popover: {
      title: 'Create a new folder',
      description: 'Set a security level when you create one — nothing inside can be more open than the folder holding it.',
      side: 'top',
    },
  },
  {
    element: '#tour-clearance',
    popover: {
      title: 'Your clearance level',
      description: "This is what you can see. Files above your clearance stay hidden — ask an admin if you're missing something you should have.",
      side: 'top',
    },
  },
];

export function startWorkspaceTour(flags: TourFlags, onDone?: () => void) {
  const steps = ALL_STEPS
    .filter(step => !step.requires || step.requires(flags))
    .filter(step => !step.element || document.querySelector(step.element as string));

  const tourDriver = driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 8,
    popoverClass: 'pact-tour-popover',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    progressText: '{{current}} of {{total}}',
    steps,
    onDestroyed: () => onDone?.(),
  });

  tourDriver.drive();
  return tourDriver;
}

export function hasCompletedWorkspaceTour(userId: string): boolean {
  return localStorage.getItem(`workspace_tour_completed_${userId}`) === 'true';
}

export function markWorkspaceTourCompleted(userId: string): void {
  localStorage.setItem(`workspace_tour_completed_${userId}`, 'true');
}
