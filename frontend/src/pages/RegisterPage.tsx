import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { authApi } from "../api/resources";
import { useAuth } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordInput } from "../components/auth/PasswordInput";
import { PasswordStrength } from "../components/auth/PasswordStrength";
import {
  EMPTY_DRAFT,
  LIMITS,
  REGISTRATION_STEPS,
  SKILL_IDEAS,
  STEP_COPY,
  STEP_FIELDS,
  normalizeSkill,
  toRegistrationPayload,
  validateStep,
  type RegistrationDraft,
  type RegistrationField,
  type RegistrationStep,
} from "../components/auth/registration";
import { useRememberedEmail } from "../components/auth/rememberedEmail";
import { StepIndicator } from "../components/auth/StepIndicator";
import { useTouched } from "../components/auth/useTouched";
import { codePointLength, firstInvalid, visibleErrors } from "../components/auth/validation";
import {
  Avatar,
  Button,
  ButtonLink,
  ErrorNotice,
  Field,
  Icon,
  Input,
  Notice,
  TagInput,
} from "../components/ui";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const STEPS = REGISTRATION_STEPS.map((id) => ({ id, ...STEP_COPY[id] }));

/** Ids are fixed, not generated, so validation can move focus to any field by name. */
const fieldId = (field: RegistrationField) => `register-${field}`;

const isDuplicateEmail = (error: unknown) =>
  error instanceof ApiError && error.code === "duplicate_email";

/**
 * A candidate creates their account and profile in two steps, then is signed straight
 * in. Each step is validated on its own before moving on; the API remains the
 * authority, and anything it refuses comes back as a notice on the right step.
 */
export function RegisterPage() {
  const { state, signIn } = useAuth();
  const navigate = useNavigate();
  const [, setRememberedEmail] = useRememberedEmail();

  const [step, setStep] = useState<RegistrationStep>("account");
  const [draft, setDraft] = useState<RegistrationDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  // Set once the account exists, so a failed sign-in is retried without registering
  // twice — a second POST would only get duplicate_email.
  const [created, setCreated] = useState(false);
  const { touched, touch, touchOnBlur } = useTouched<RegistrationField>();

  // A fresh object each time, so asking for the same field twice still moves focus.
  const [focusRequest, setFocusRequest] = useState<{ field: RegistrationField } | null>(null);
  useEffect(() => {
    if (focusRequest) document.getElementById(fieldId(focusRequest.field))?.focus();
  }, [focusRequest]);

  const stepNumber = REGISTRATION_STEPS.indexOf(step) + 1;
  useDocumentTitle(`Create your account (step ${stepNumber} of ${REGISTRATION_STEPS.length})`);

  if (state.status === "signed-in") return <Navigate to="/" replace />;

  const shown = visibleErrors(validateStep(step, draft), touched);

  function update<K extends RegistrationField>(field: K, value: RegistrationDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    // An edit answers whatever the server last objected to; a stale notice would mislead.
    if (!created) setError(null);
  }

  function goTo(target: RegistrationStep) {
    setStep(target);
    const first = STEP_FIELDS[target][0];
    if (first) setFocusRequest({ field: first });
  }

  /** Shows the step's errors and focuses the first one. False if there was one. */
  function checkStep(target: RegistrationStep): boolean {
    touch(STEP_FIELDS[target]);
    const invalid = firstInvalid(STEP_FIELDS[target], validateStep(target, draft));
    if (!invalid) return true;
    setStep(target);
    setFocusRequest({ field: invalid });
    return false;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step === "account") {
      if (checkStep("account")) goTo("profile");
      return;
    }
    if (!checkStep("account") || !checkStep("profile")) return;

    setPending(true);
    setError(null);
    try {
      if (!created) {
        await authApi.register(toRegistrationPayload(draft));
        setCreated(true);
      }
      await signIn(draft.email.trim(), draft.password);
      setRememberedEmail(draft.email.trim());
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught);
      if (isDuplicateEmail(caught)) {
        setStep("account");
        setFocusRequest({ field: "email" });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout width="wide">
      <header className="auth-form-head">
        <h1 className="auth-title">Create your candidate account</h1>
        <p className="auth-subtitle">
          One profile for every role you apply to, and a clear view of where each application stands.
        </p>
      </header>

      <StepIndicator
        steps={STEPS}
        current={step}
        onSelect={goTo}
        aria-label="Registration progress"
      />

      <form className="auth-form" onSubmit={submit} noValidate aria-busy={pending || undefined}>
        {step === "account" ? (
          <section className="auth-step-panel" aria-labelledby="register-step-title">
            <h2 id="register-step-title" className="sr-only">
              Step 1: your account
            </h2>
            <Field label="Full name" id={fieldId("full_name")} error={shown.full_name} required>
              <Input
                autoComplete="name"
                value={draft.full_name}
                onChange={(event) => update("full_name", event.target.value)}
                onBlur={touchOnBlur("full_name")}
                placeholder="Ayesha Khan"
              />
            </Field>

            <Field
              label="Email"
              id={fieldId("email")}
              // The notice below says what to do; the field shows which input is at fault.
              error={shown.email ?? (isDuplicateEmail(error) ? "This email already has an account." : undefined)}
              hint="You will sign in with it. Hiring teams use it to reach you."
              required
            >
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={draft.email}
                onChange={(event) => update("email", event.target.value)}
                onBlur={touchOnBlur("email")}
                placeholder="ayesha@example.com"
              />
            </Field>

            <div className="auth-password-field">
              <Field label="Password" id={fieldId("password")} error={shown.password} required>
                <PasswordInput
                  autoComplete="new-password"
                  value={draft.password}
                  onChange={(event) => update("password", event.target.value)}
                  onBlur={touchOnBlur("password")}
                />
              </Field>
              <PasswordStrength
                password={draft.password}
                context={{ email: draft.email, fullName: draft.full_name }}
              />
            </div>
          </section>
        ) : (
          <section className="auth-step-panel" aria-labelledby="register-step-title">
            <h2 id="register-step-title" className="sr-only">
              Step 2: your profile
            </h2>
            <div className="auth-summary">
              <Avatar name={draft.full_name || draft.email} size="sm" />
              <div className="auth-summary-text">
                <span className="auth-summary-name">{draft.full_name.trim()}</span>
                <span className="auth-summary-email">{draft.email.trim()}</span>
              </div>
              <Button variant="ghost" size="sm" leftIcon="edit" onClick={() => goTo("account")}>
                Edit<span className="sr-only"> account details</span>
              </Button>
            </div>

            <Field
              label="Headline"
              id={fieldId("headline")}
              error={shown.headline}
              hint="One line that sums up what you do. It tops your profile."
              labelAside={`${codePointLength(draft.headline.trim())} / ${LIMITS.headlineMax}`}
              optional
            >
              <Input
                value={draft.headline}
                onChange={(event) => update("headline", event.target.value)}
                onBlur={touchOnBlur("headline")}
                placeholder="Backend engineer, distributed systems"
              />
            </Field>

            <div className="auth-form-row">
              <Field
                label="Years of experience"
                id={fieldId("years_experience")}
                error={shown.years_experience}
                hint="Roles set a minimum."
                required
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={LIMITS.yearsMax}
                  step={1}
                  value={draft.years_experience}
                  onChange={(event) => update("years_experience", event.target.value)}
                  onBlur={touchOnBlur("years_experience")}
                />
              </Field>
              <Field label="Phone" id={fieldId("phone")} error={shown.phone} optional>
                <Input
                  type="tel"
                  autoComplete="tel"
                  value={draft.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  onBlur={touchOnBlur("phone")}
                  placeholder="+92 300 1234567"
                />
              </Field>
            </div>

            <Field
              label="Skills"
              id={fieldId("skills")}
              error={shown.skills}
              hint="Press Enter or a comma after each one. To apply, you need at least one skill a role asks for."
            >
              <TagInput
                value={draft.skills}
                onChange={(skills) => update("skills", skills)}
                normalize={normalizeSkill}
                suggestions={SKILL_IDEAS}
                placeholder={draft.skills.length ? "Add another" : "python, react, sql…"}
              />
            </Field>
            {draft.skills.length === 0 && (
              <p className="auth-inline-tip">
                <Icon name="info" size={14} />
                Without skills you can still sign up, but most roles will not be open to you
                until you add some on your profile.
              </p>
            )}
          </section>
        )}

        <RegistrationError error={error} created={created} email={draft.email.trim()} />

        <div className="auth-actions">
          {step === "profile" && (
            <Button size="lg" leftIcon="arrow-left" onClick={() => goTo("account")} disabled={pending}>
              Back
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="auth-actions-primary"
            loading={pending}
            rightIcon={step === "account" ? "arrow-right" : undefined}
          >
            {step === "account" ? "Continue" : created ? "Sign in" : "Create account"}
          </Button>
        </div>
      </form>

      <div className="auth-alt">
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
        <p className="auth-alt-note">
          <Icon name="building" size={14} />
          Hiring for a team? Recruiter accounts are set up by your administrator.
        </p>
      </div>
    </AuthLayout>
  );
}

/**
 * What went wrong, with the way forward. A taken email and an account that exists but
 * could not be signed into both end on the sign-in page, with the email filled in.
 */
function RegistrationError({
  error,
  created,
  email,
}: {
  error: unknown;
  created: boolean;
  email: string;
}) {
  if (!error) return null;
  const signInLink = (
    <ButtonLink to="/login" state={{ email }} size="sm" rightIcon="arrow-right">
      Go to sign in
    </ButtonLink>
  );

  if (isDuplicateEmail(error)) {
    return (
      <Notice tone="rule" title="That email already has an account" action={signInLink}>
        Sign in with it instead, or use a different email to create a new account.
      </Notice>
    );
  }
  if (created) {
    return (
      <Notice tone="rule" title="Your account is ready, but signing in failed" action={signInLink}>
        Try again, or sign in yourself with the email and password you just chose.
      </Notice>
    );
  }
  return <ErrorNotice error={error} />;
}
