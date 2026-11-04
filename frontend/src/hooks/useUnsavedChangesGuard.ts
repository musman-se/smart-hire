import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

import { useConfirm } from "../components/ui";

/**
 * Asks before throwing away unsaved edits: in-app navigation is held by the router
 * while a confirm dialog asks, and closing or reloading the tab gets the browser's own
 * prompt. Moving within the page (a query string, a "#skills" link) is never blocked.
 * Needs the data router (createBrowserRouter), which useBlocker requires.
 *
 * After a successful save, call `allowNavigation()` before navigating away: the form is
 * still dirty in the render that navigates, so the guard would otherwise stop it.
 */
export function useUnsavedChangesGuard(dirty: boolean, { body }: { body: string }) {
  const confirm = useConfirm();
  const bypass = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !bypass.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirm({
      title: "Discard unsaved changes?",
      body,
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      tone: "danger",
    }).then((leave) => (leave ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm, body]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older Chromium shows the prompt only when returnValue is set.
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const allowNavigation = useCallback(() => {
    bypass.current = true;
  }, []);

  return { allowNavigation };
}
