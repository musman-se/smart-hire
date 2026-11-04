/** Joins class names, skipping falsy parts: cx("btn", primary && "btn-primary"). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
