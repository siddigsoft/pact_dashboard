/**
 * useNavigationGuard
 *
 * Returns a `guardedNavigate` function that wraps `useNavigate()`.
 * When `hasUnsavedChanges` is true it shows a confirmation dialog before
 * navigating; when false it navigates immediately, matching the standard
 * `navigate()` signature.
 *
 * Usage:
 *   const { guardedNavigate } = useNavigationGuard(hasUnsavedChanges);
 *   <Button onClick={() => guardedNavigate('/other-page')}>Go</Button>
 */
import { useCallback } from 'react';
import { useNavigate, NavigateOptions } from 'react-router-dom';

const DEFAULT_MESSAGE =
  'You have unsaved changes. Are you sure you want to leave this page? Your changes will be lost.';

interface Options {
  /** Override the confirmation message shown to the user. */
  message?: string;
}

export function useNavigationGuard(
  hasUnsavedChanges: boolean,
  { message = DEFAULT_MESSAGE }: Options = {},
) {
  const navigate = useNavigate();

  const guardedNavigate = useCallback(
    (to: string, options?: NavigateOptions) => {
      if (hasUnsavedChanges) {
        if (!window.confirm(message)) return;
      }
      navigate(to, options);
    },
    [hasUnsavedChanges, message, navigate],
  );

  return { guardedNavigate };
}
