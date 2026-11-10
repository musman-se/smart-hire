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
 * A first name to greet, guessed from an email: "sara.khan@…" → "Sara". The fallback
 * for when the recruiter's profile name has not loaded (see greetingFor). Role
 * mailboxes and handles with digits give null — "Good morning" beats "Good morning, Hr".
 */
export function greetingName(email: string): string | null {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._+-]+/).find(Boolean) ?? "";
  if (first.length < 2 || /\d/.test(first) || ROLE_MAILBOXES.has(first.toLowerCase())) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** The name to greet a recruiter by: the first word of the name on their profile, or a
 * guess from their email while that is loading or if it cannot be read. */
export function greetingFor(email: string, fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first || greetingName(email);
}
