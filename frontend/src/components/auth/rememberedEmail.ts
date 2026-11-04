import { useLocalStorage } from "../../hooks/useLocalStorage";

const LAST_EMAIL_KEY = "smarthire.last-email";

/**
 * The email of the last sign-in on this device, so returning users only type their
 * password. An email, never a credential; and the sign-in form lets the user opt out,
 * which clears it, for shared machines.
 */
export function useRememberedEmail() {
  const [stored, setStored] = useLocalStorage<string>(LAST_EMAIL_KEY, "");
  // Storage is shared with whatever else runs on this origin: trust only a string.
  const email = typeof stored === "string" ? stored : "";
  return [email, setStored] as const;
}
