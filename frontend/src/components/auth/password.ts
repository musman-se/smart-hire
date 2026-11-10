import { codePointLength, type FieldErrors } from "./validation";

/** Mirrors PASSWORD_MIN_LENGTH / PASSWORD_MAX_LENGTH in backend/app/auth/schemas.py. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** What the password should not be built from: the account's own name and email. */
export interface PasswordContext {
  email?: string;
  fullName?: string;
}

export interface PasswordCheck {
  id: "length" | "long" | "variety" | "personal";
  label: string;
  met: boolean;
  /** Required checks are the API's rules; the rest are advice it does not enforce. */
  required: boolean;
}

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthScore;
  label: string;
}

const SCORE_LABELS: Record<StrengthScore, string> = {
  0: "Too short",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};

/** The handful of choices every guessing list starts with. Not exhaustive — a nudge,
 * not a blocklist; the API accepts them. */
const COMMON_PASSWORDS = new Set([
  "password",
  "passw0rd",
  "qwerty",
  "qwertyuiop",
  "letmein",
  "iloveyou",
  "welcome",
  "admin",
  "abc123",
  "monkey",
  "dragon",
  "football",
  "smarthire",
]);

function characterClasses(password: string): number {
  return [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((pattern) => pattern.test(password))
    .length;
}

/** "aaaaaaaa", "12345678", "abcdefgh", "87654321": one key held, or a run along the keyboard row. */
function isRepetitiveOrSequential(password: string): boolean {
  const codes = [...password.toLowerCase()].map((char) => char.codePointAt(0) ?? 0);
  const steps = new Set(codes.slice(1).map((code, i) => code - (codes[i] ?? 0)));
  return steps.size === 1 && [0, 1, -1].some((step) => steps.has(step));
}

/** Name parts and the email's local part, three characters or longer: "ayesha", "khan". */
function personalTokens({ email = "", fullName = "" }: PasswordContext): string[] {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  return [local, ...fullName.toLowerCase().split(/\s+/)].filter((token) => token.length >= 3);
}

function containsPersonalInfo(password: string, context: PasswordContext): boolean {
  const lowered = password.toLowerCase();
  return personalTokens(context).some((token) => lowered.includes(token));
}

function isCommon(password: string): boolean {
  // "Password1!" is still "password": strip the digits and symbols people append.
  const core = password.toLowerCase().replace(/[^a-z]+$/, "");
  return COMMON_PASSWORDS.has(core) || COMMON_PASSWORDS.has(password.toLowerCase());
}

/** The checklist shown under the password field, in display order. */
export function passwordChecks(password: string, context: PasswordContext = {}): PasswordCheck[] {
  const length = codePointLength(password);
  return [
    {
      id: "length",
      label: `${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
      met: length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH,
      required: true,
    },
    { id: "long", label: "12 or more characters", met: length >= 12, required: false },
    {
      id: "variety",
      label: "Mixes letters, numbers and symbols",
      met: characterClasses(password) >= 3,
      required: false,
    },
    {
      id: "personal",
      label: "Avoids your name and email",
      // Vacuously true for an empty box would show a green tick before anything is typed.
      met: password.length > 0 && !containsPersonalInfo(password, context),
      required: false,
    },
  ];
}

export type PasswordChangeField = "current" | "next" | "confirm";
export const PASSWORD_CHANGE_ORDER: readonly PasswordChangeField[] = ["current", "next", "confirm"];

/**
 * The current password is checked by the server only, as at sign-in. The new one
 * follows registration's length rule and must differ, which the API also enforces; the
 * confirmation is the console's own check, against a typo nobody could sign in with.
 */
export function validatePasswordChange(
  values: Record<PasswordChangeField, string>,
): FieldErrors<PasswordChangeField> {
  const chosen = checkChosenPassword(values.next, values.confirm, {
    choose: "Choose a new password",
    again: "Enter the new password again",
  });
  const errors: FieldErrors<PasswordChangeField> = {};
  if (!values.current) errors.current = "Enter your current password";
  if (chosen.password) errors.next = chosen.password;
  else if (values.next === values.current) errors.next = "Choose a password you are not using now";
  if (chosen.confirm) errors.confirm = chosen.confirm;
  return errors;
}

export type NewPasswordField = "password" | "confirm";
export const NEW_PASSWORD_ORDER: readonly NewPasswordField[] = ["password", "confirm"];

/**
 * A first password, chosen through an invitation: registration's length rule, plus
 * the confirmation, since nobody can sign in to reset a typo'd one.
 */
export function validateNewPassword(
  values: Record<NewPasswordField, string>,
): FieldErrors<NewPasswordField> {
  return checkChosenPassword(values.password, values.confirm, {
    choose: "Choose a password",
    again: "Enter the password again",
  });
}

/**
 * The rules for any password someone chooses, with its confirmation: the length range
 * the API enforces, and a match, against a typo nobody could sign in with. Shared by the
 * change-password and invitation forms; the prompts are theirs, as their fields differ.
 */
function checkChosenPassword(
  password: string,
  confirm: string,
  prompts: { choose: string; again: string },
): FieldErrors<NewPasswordField> {
  const errors: FieldErrors<NewPasswordField> = {};
  const length = codePointLength(password);
  if (!password) errors.password = prompts.choose;
  else if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH)
    errors.password = `Use ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`;
  if (!confirm) errors.confirm = prompts.again;
  else if (confirm !== password) errors.confirm = "The passwords do not match";
  return errors;
}

/**
 * A 0–4 estimate of how hard the password is to guess. Length does most of the work,
 * variety helps, and anything on a guessing list — common words, runs, the user's own
 * name — is capped at Weak however long it is. It advises; only the length range is
 * enforced, because that is all the API enforces.
 */
export function passwordStrength(password: string, context: PasswordContext = {}): PasswordStrength {
  const length = codePointLength(password);
  if (length > PASSWORD_MAX_LENGTH) return { score: 0, label: "Too long" };
  if (length < PASSWORD_MIN_LENGTH) return { score: 0, label: SCORE_LABELS[0] };

  const guessable =
    isCommon(password) ||
    isRepetitiveOrSequential(password) ||
    containsPersonalInfo(password, context);
  if (guessable) return { score: 1, label: SCORE_LABELS[1] };

  const classes = characterClasses(password);
  const points = [length >= 12, classes >= 3, length >= 16 || (length >= 12 && classes === 4)];
  const score = (1 + points.filter(Boolean).length) as StrengthScore;
  return { score, label: SCORE_LABELS[score] };
}
