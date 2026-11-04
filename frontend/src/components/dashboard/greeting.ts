/** Shared mailboxes are not people, so they are not greeted by name. */
const ROLE_MAILBOXES = new Set([
  "admin",
  "careers",
  "hiring",
  "hr",
  "info",
  "jobs",
  "people",
  "recruiter",
  "recruiting",
  "talent",
  "team",
]);

/**
 * A first name to greet, from the only name an account has: its email. "sara.khan@…"
 * → "Sara". Role mailboxes and handles with digits give null — "Good morning" beats
 * "Good morning, Hr".
 */
export function greetingName(email: string): string | null {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._+-]+/).find(Boolean) ?? "";
  if (first.length < 2 || /\d/.test(first) || ROLE_MAILBOXES.has(first.toLowerCase())) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
