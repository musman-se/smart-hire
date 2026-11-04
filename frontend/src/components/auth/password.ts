import { codePointLength } from "./validation";

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
