import { Icon } from "../ui";
import { passwordChecks, passwordStrength, type PasswordContext } from "./password";

const SEGMENTS = [1, 2, 3, 4] as const;

/**
 * The meter and checklist under a new-password field. Only the length rule is
 * required — it is the API's only rule — so it is listed apart from the tips, which
 * are advice the user may ignore.
 */
export function PasswordStrength({
  password,
  context,
}: {
  password: string;
  context: PasswordContext;
}) {
  const strength = passwordStrength(password, context);
  const checks = passwordChecks(password, context);
  const required = checks.filter((check) => check.required);
  const tips = checks.filter((check) => !check.required);

  return (
    <div className="auth-strength" data-score={password ? strength.score : undefined}>
      <div className="auth-strength-head">
        <div className="auth-strength-meter" aria-hidden="true">
          {SEGMENTS.map((segment) => (
            <span key={segment} data-on={strength.score >= segment || undefined} />
          ))}
        </div>
        {/* Polite and short: it changes only when a threshold is crossed, so it is
            announced a few times while typing, not on every key. */}
        <span className="auth-strength-label" aria-live="polite">
          {password ? (
            <>
              Strength: <strong>{strength.label}</strong>
            </>
          ) : (
            "Choose a password"
          )}
        </span>
      </div>
      <div className="auth-checklists">
        <CheckList title="Required" checks={required} />
        <CheckList title="Makes it stronger" checks={tips} />
      </div>
    </div>
  );
}

function CheckList({ title, checks }: { title: string; checks: ReturnType<typeof passwordChecks> }) {
  return (
    <div className="auth-checklist">
      <span className="auth-checklist-title">{title}</span>
      <ul>
        {checks.map((check) => (
          <li key={check.id} data-met={check.met || undefined}>
            <Icon name={check.met ? "check-circle" : "circle"} size={14} />
            <span>
              {check.label}
              <span className="sr-only">{check.met ? " (done)" : " (not yet)"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
