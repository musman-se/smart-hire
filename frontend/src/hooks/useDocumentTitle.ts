import { useEffect } from "react";

const APP_NAME = "SmartHire";

/** Sets the tab title to "<title> · SmartHire" while the calling page is mounted.
 * Pass undefined while the data the title needs is still loading. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
