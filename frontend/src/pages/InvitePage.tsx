import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import type { InvitationPreview, TokenPair } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { AuthLayout } from "../components/auth/AuthLayout";
import {
  NEW_PASSWORD_ORDER,
  validateNewPassword,
  type NewPasswordField,
} from "../components/auth/password";
import { PasswordInput } from "../components/auth/PasswordInput";
import { PasswordStrength } from "../components/auth/PasswordStrength";
import { useRememberedEmail } from "../components/auth/rememberedEmail";
import { useTouched } from "../components/auth/useTouched";
import { firstInvalid, visibleErrors } from "../components/auth/validation";
import {
  Avatar,
  Button,
  ButtonLink,
  ErrorNotice,
  Field,
  Notice,
  PageLoader,
  Spinner,
  formatDateTime,
} from "../components/ui";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useAcceptInvitation, useInvitationPreview } from "../hooks/useInvitation";

/** Unknown, expired or already used: the server's one answer for a link that is done. */
const isInvalidInvitation = (error: unknown) =>
  error instanceof ApiError && error.code === "invalid_invitation";

/**
 * Looking a link up: also a 422, a token the server will not even look up (mangled by a
 * mail client, say). Trying again would only fail again, so it gets "ask your admin",
 * not "try again". Only for the lookup — a 422 on accept is about the password, and the
 * link still works.
 */
const isDeadLink = (error: unknown) =>
  isInvalidInvitation(error) || (error instanceof ApiError && error.status === 422);

/**
 * Where the token waits once it is out of the address bar, so a reload of /invite (after
 * a network error, say) still finds it instead of calling a working link invalid. This
 * tab only, and dropped as soon as the link is spent or turns out not to work.
 */
const STORED_TOKEN_KEY = "smarthire.invitation";

/** The token from /invite#<token>, or the one this tab kept. Empty when there is none. */
function readInvitationToken(): string {
  const fromLink = window.location.hash.slice(1).trim();
  try {
    if (fromLink) sessionStorage.setItem(STORED_TOKEN_KEY, fromLink);
    return fromLink || sessionStorage.getItem(STORED_TOKEN_KEY) || "";
  } catch {
    // Storage can be blocked (private mode, site data off): the link still works once.
    return fromLink;
  }
}

function forgetStoredToken(): void {
  try {
    sessionStorage.removeItem(STORED_TOKEN_KEY);
  } catch {
    // Nothing was stored.
  }
}

/**
 * Takes the token out of the address bar, so it does not linger in history, a
 * screenshot or a shared screen. The router's own history state is kept, so Back and
 * Forward still work.
 */
function forgetInvitationToken(): void {
  if (!window.location.hash) return;
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );
}

/**
 * Where an invited recruiter lands from the link their admin sent: who the invitation
 * is for, then a password, then straight into the console — the accept answers with a
 * token pair, adopted as the session (AuthProvider.adoptSession).
 *
 * Someone already signed in in this browser is asked to sign out first rather than
 * being signed out silently: the link may have been opened by the admin checking it,
 * and a new account replacing their session without a word would surprise them.
 */
export function InvitePage() {
  // A second link opened in this tab changes only the fragment, which does not remount
  // the page; keyed on it, the page starts over with the new token. The router keeps
  // the fragment it arrived with even after the address bar is cleared (replaceState
  // does not tell it), so the key holds still until a new link comes.
  const { hash } = useLocation();
  return <InvitationFlow key={hash} />;
}

function InvitationFlow() {
  useDocumentTitle("Join your hiring team");
  const { state, adoptSession, signOut } = useAuth();
  const navigate = useNavigate();
  // Read once, on the first render: the effect below wipes it from the address bar.
  const [token] = useState(readInvitationToken);
  useEffect(forgetInvitationToken, []);

  // "joining" from the accept request on, so the moment this tab turns signed in is
  // not mistaken for "already signed in", and the spent link is not previewed again.
  const [phase, setPhase] = useState<Phase>({ step: "form" });
  const signedIn = state.status === "signed-in";
  const preview = useInvitationPreview(token, {
    enabled:
      phase.step === "form" && (state.status === "signed-out" || state.status === "unavailable"),
  });

  if (phase.step === "sign-in-failed") return <SignInFailed email={phase.email} />;

  if (signedIn && phase.step === "joining") return <PageLoader label="Signing you in…" />;
  if (state.status === "loading") return <PageLoader label="Checking your session…" />;

  if (!token) return <InvalidInvitation />;

  if (signedIn) {
    return (
      <AuthLayout>
        <header className="auth-form-head">
          <h1 className="auth-title">You are already signed in</h1>
          <p className="auth-subtitle">
            This browser is signed in as <strong>{state.user.email}</strong>. To accept the
            invitation and set up the new account, sign out first.
          </p>
        </header>
        <div className="auth-actions">
          {/* Staying means not using the link here: nothing to keep it for. */}
          <ButtonLink to="/" size="lg" onClick={forgetStoredToken}>
            Stay signed in
          </ButtonLink>
          <Button
            variant="primary"
            size="lg"
            className="auth-actions-primary"
            leftIcon="log-out"
            onClick={() => void signOut()}
          >
            Sign out and continue
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (isDeadLink(preview.error)) return <InvalidInvitation />;

  if (preview.error) {
    return (
      <AuthLayout>
        <header className="auth-form-head">
          <h1 className="auth-title">We could not open your invitation</h1>
        </header>
        <ErrorNotice error={preview.error} />
        <div className="auth-actions">
          <Button variant="primary" size="lg" leftIcon="refresh" onClick={() => void preview.refetch()}>
            Try again
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (!preview.data) {
    return (
      <AuthLayout>
        <div className="invite-loading">
          <Spinner label="Opening your invitation" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AcceptForm
      token={token}
      invitation={preview.data}
      onPhase={setPhase}
      adoptSession={adoptSession}
      onJoined={() => navigate("/", { replace: true })}
    />
  );
}

type Phase =
  | { step: "form" }
  | { step: "joining" }
  // The password is set but signing in with the pair failed: the account is ready, so
  // the way forward is the sign-in page, not another accept (the link is spent).
  | { step: "sign-in-failed"; email: string };

function AcceptForm({
  token,
  invitation,
  onPhase,
  adoptSession,
  onJoined,
}: {
  token: string;
  invitation: InvitationPreview;
  onPhase: (phase: Phase) => void;
  adoptSession: (tokens: TokenPair) => Promise<void>;
  onJoined: () => void;
}) {
  const accept = useAcceptInvitation();
  const [, setRememberedEmail] = useRememberedEmail();
  const [values, setValues] = useState<Record<NewPasswordField, string>>({ password: "", confirm: "" });
  const { touched, touch, touchOnBlur } = useTouched<NewPasswordField>();

  const refs: Record<NewPasswordField, RefObject<HTMLInputElement | null>> = {
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };

  const errors = validateNewPassword(values);
  const shown = visibleErrors(errors, touched);
  const pending = accept.isPending;

  if (isInvalidInvitation(accept.error)) return <InvalidInvitation />;

  function update(field: NewPasswordField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    touch(NEW_PASSWORD_ORDER);
    const invalid = firstInvalid(NEW_PASSWORD_ORDER, errors);
    if (invalid) {
      refs[invalid].current?.focus();
      return;
    }

    onPhase({ step: "joining" });
    let tokens: TokenPair;
    try {
      tokens = await accept.mutateAsync({ token, password: values.password });
    } catch {
      onPhase({ step: "form" }); // the form shows accept.error
      return;
    }
    forgetStoredToken(); // spent: the link works once
    try {
      await adoptSession(tokens);
    } catch {
      onPhase({ step: "sign-in-failed", email: invitation.email });
      return;
    }
    setRememberedEmail(invitation.email);
    onJoined();
  }

  return (
    <AuthLayout>
      <header className="auth-form-head">
        <h1 className="auth-title">Welcome, {invitation.full_name}</h1>
        <p className="auth-subtitle">
          You have been added to the hiring team on SmartHire. Choose a password to finish
          setting up your account.
        </p>
      </header>

      <div className="auth-summary">
        <Avatar name={invitation.full_name} size="sm" />
        <div className="auth-summary-text">
          <span className="auth-summary-name">{invitation.full_name}</span>
          <span className="auth-summary-email">{invitation.email}</span>
        </div>
      </div>

      <form className="auth-form" onSubmit={submit} noValidate aria-busy={pending || undefined}>
        {/* For password managers: the account this password belongs to. */}
        <input type="text" hidden readOnly autoComplete="username" value={invitation.email} />

        <div className="auth-password-field">
          <Field label="Password" error={shown.password} required>
            <PasswordInput
              ref={refs.password}
              autoComplete="new-password"
              autoFocus
              value={values.password}
              onChange={(event) => update("password", event.target.value)}
              onBlur={touchOnBlur("password")}
            />
          </Field>
          <PasswordStrength
            password={values.password}
            context={{ email: invitation.email, fullName: invitation.full_name }}
          />
        </div>

        <Field label="Confirm password" error={shown.confirm} required>
          <PasswordInput
            ref={refs.confirm}
            autoComplete="new-password"
            value={values.confirm}
            onChange={(event) => update("confirm", event.target.value)}
            onBlur={touchOnBlur("confirm")}
          />
        </Field>

        <ErrorNotice error={accept.error} />

        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          Set password and sign in
        </Button>
        <p className="auth-inline-tip">
          This link works once, until{" "}
          <time dateTime={invitation.expires_at}>{formatDateTime(invitation.expires_at)}</time>.
        </p>
      </form>

      <div className="auth-alt">
        <p>
          Already set your password? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function SignInFailed({ email }: { email: string }) {
  return (
    <AuthLayout>
      <header className="auth-form-head">
        <h1 className="auth-title">Your password is set</h1>
      </header>
      <Notice
        tone="rule"
        title="Signing you in failed"
        action={
          <ButtonLink to="/login" state={{ email }} size="sm" rightIcon="arrow-right">
            Go to sign in
          </ButtonLink>
        }
      >
        Your account is ready. Sign in with {email} and the password you just chose.
      </Notice>
    </AuthLayout>
  );
}

function InvalidInvitation() {
  // A dead link is not worth keeping for the next reload.
  useEffect(forgetStoredToken, []);
  return (
    <AuthLayout>
      <header className="auth-form-head">
        <h1 className="auth-title">This invitation link does not work</h1>
      </header>
      <Notice tone="rule" title="Invitation link not valid">
        This link is invalid, expired or already used. Ask your admin for a new one.
      </Notice>
      <div className="auth-alt">
        <p>
          Already set your password? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
