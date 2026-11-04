/** Error messages keyed by field; a field that is absent is valid. */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/**
 * Length the way the API counts it. Pydantic measures a Python str in code points,
 * while a JS string's .length counts UTF-16 units, so an emoji would count twice here
 * and a valid value could be refused before it ever reached the server.
 */
export function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * A deliberately loose shape check: something@something.tld, no spaces. The server's
 * validator is the authority; this only catches the typos worth fixing before a
 * round trip.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type SignInField = "email" | "password";

/**
 * Sign-in checks presence and shape only. Length rules belong to registration: a
 * password is compared with what was stored, not with today's rules (the API does
 * the same — see LoginRequest).
 */
export function validateSignIn(values: Record<SignInField, string>): FieldErrors<SignInField> {
  const errors: FieldErrors<SignInField> = {};
  const email = values.email.trim();
  if (!email) errors.email = "Enter your email address";
  else if (!looksLikeEmail(email)) errors.email = "Enter an email address like name@example.com";
  if (!values.password) errors.password = "Enter your password";
  return errors;
}

/**
 * Only the errors for fields the user has finished with. Messages appear after a
 * field is left or a submit is attempted, never while someone is still typing their
 * first character — but once shown, they clear the moment the value becomes valid,
 * because the errors themselves are recomputed from the values on every render.
 */
export function visibleErrors<K extends string>(
  errors: FieldErrors<K>,
  touched: ReadonlySet<K>,
): FieldErrors<K> {
  const visible: FieldErrors<K> = {};
  for (const field of touched) {
    if (errors[field]) visible[field] = errors[field];
  }
  return visible;
}

/** The first field, in form order, that has an error: where focus should go. */
export function firstInvalid<K extends string>(
  order: readonly K[],
  errors: FieldErrors<K>,
): K | undefined {
  return order.find((field) => errors[field]);
}
