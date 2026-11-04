/** The name to greet someone by: the first word of their full name. */
export function firstName(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] ?? "";
}
