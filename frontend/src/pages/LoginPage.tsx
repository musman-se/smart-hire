import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { ErrorNotice } from "../components/ui";

export function LoginPage() {
  const { state, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/jobs";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (state.status === "signed-in") return <Navigate to={from} replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="panel auth-card" onSubmit={submit}>
        <span className="brand">
          Smart<span>Hire</span>
        </span>
        <h1>Sign in</h1>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <ErrorNotice error={error} />

        <button type="submit" className="primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted">
          Looking for a job? <Link to="/register">Create a candidate account</Link>.
          Recruiter accounts are created by an administrator.
        </p>
      </form>
    </div>
  );
}
