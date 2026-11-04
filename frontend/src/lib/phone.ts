/**
 * The API stores a phone number as free text (only a 32-character limit), but
 * recruiters read it and dial it through a tel: link, so the forms accept only what
 * reads as a number: an optional leading +, then digits with the usual separators
 * (spaces, dashes, dots, brackets). Seven to fifteen digits spans a local number up
 * to the longest international one (E.164).
 */
const PHONE_SHAPE = /^\+?[\d\s().-]+$/;

export const PHONE_DIGITS = { min: 7, max: 15 } as const;

/** True for an empty value too: the field is optional, so blank is not "wrong". */
export function looksLikePhone(value: string): boolean {
  const phone = value.trim();
  if (!phone) return true;
  if (!PHONE_SHAPE.test(phone)) return false;
  const digits = phone.replace(/\D/g, "").length;
  return digits >= PHONE_DIGITS.min && digits <= PHONE_DIGITS.max;
}
