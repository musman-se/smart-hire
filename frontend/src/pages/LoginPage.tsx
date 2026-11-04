import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordInput } from "../components/auth/PasswordInput";
import { useRememberedEmail } from "../components/auth/rememberedEmail";
import { useTouched } from "../components/auth/useTouched";
import {
  firstInvalid,
  validateSignIn,
  visibleErrors,
  type SignInField,
} from "../components/auth/validation";
import { Button, Checkbox, ErrorNotice, Field, Icon, Input, Notice } from "../components/ui";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

/** `from`: where RequireAuth was taking the user. `email`: prefilled by registration's
 * "sign in instead". */
type LoginState = { from?: string; email?: string } | null;

const FIELD_ORDER: readonly SignInField[] = ["email", "password"];

const isWrongCredentials = (error: unknown) =>
  error instanceof ApiError && error.code === "invalid_credentials";

export function LoginPage() {
  useDocumentTitle("Sign in");
  const { state, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LoginState;
  // "/" sends each role to its own home page.
  const from = locationState?.from ?? "/";

  const [rememberedEmail, setRememberedEmail] = useRememberedEmail();
  const [remember, setRemember] = useState(true);
  const [email, setEmail] = useState(() => locationState?.email ?? rememberedEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const { touched, touch, touchOnBlur } = useTouched<SignInField>();

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const refs: Record<SignInField, typeof emailRef> = { email: emailRef, password: passwordRef };

  const errors = validateSignIn({ email, password });
  const shown = visibleErrors(errors, touched);

  if (state.status === "signed-in") return <Navigate to={from} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    touch(FIELD_ORDER);
    const invalid = firstInvalid(FIELD_ORDER, errors);
    if (invalid) {
      refs[invalid].current?.focus();
      return;
    }

    setPending(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      setRememberedEmail(remember ? email.trim() : "");
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught);
      // The email is usually right and the password is the typo: select it, ready to retype.
      if (isWrongCredentials(caught)) {
        passwordRef.current?.select();
        passwordRef.current?.focus();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      <header className="auth-form-head">
        <h1 className="auth-title">Sign in to SmartHire</h1>
        <p className="auth-subtitle">
          {from === "/"
            ? "Welcome back. Pick up where you left off."
            : "Sign in to continue to the page you were opening."}
        </p>
      </header>

      <form className="auth-form" onSubmit={submit} noValidate aria-busy={pending || undefined}>
        <Field label="Email" error={shown.email} required>
          <Input
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            // A returning user only has the password left to type.
            autoFocus={!email}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={touchOnBlur("email")}
            placeholder="name@example.com"
          />
        </Field>

        <Field label="Password" error={shown.password} required>
          <PasswordInput
            ref={passwordRef}
            autoComplete="current-password"
            autoFocus={Boolean(email)}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={touchOnBlur("password")}
          />
        </Field>

        <Checkbox
          label="Remember my email on this device"
          description="Turn off on a shared computer."
          checked={remember}
          onChange={(event) => {
            setRemember(event.target.checked);
            // Forgotten at once, not at the next sign-in: the user may be walking away.
            if (!event.target.checked) setRememberedEmail("");
          }}
        />

        {isWrongCredentials(error) ? (
          // An expected answer, not a fault: plain words, without the support reference
          // (code and request id) that ErrorNotice adds for real failures.
          <Notice tone="error" title="Could not sign in">
            The email or password is incorrect.
          </Notice>
        ) : (
          <ErrorNotice error={error} />
        )}

        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          Sign in
        </Button>
      </form>

      <div className="auth-alt">
        <p>
          Looking for your next role? <Link to="/register">Create a candidate account</Link>
        </p>
        <p className="auth-alt-note">
          <Icon name="building" size={14} />
          Hiring team accounts are set up by your administrator.
        </p>
      </div>
    </AuthLayout>
  );
}
