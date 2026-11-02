import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { authApi } from "../api/resources";
import type { CandidateRegistration } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { ErrorNotice } from "../components/ui";

/** A candidate creates their own account and profile, then is signed straight in. */
export function RegisterPage() {
  const { state, signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    headline: "",
    years_experience: 0,
    skills: "",
  });
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (state.status === "signed-in") return <Navigate to="/jobs" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const payload: CandidateRegistration = {
      email: form.email,
      password: form.password,
      full_name: form.full_name,
      headline: form.headline || null,
      years_experience: Number(form.years_experience) || 0,
      skills: form.skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
    };

    try {
      await authApi.register(payload);
      await signIn(form.email, form.password);
      navigate("/jobs", { replace: true });
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
        <h1>Create a candidate account</h1>

        <div className="field">
          <label htmlFor="full_name">Full name</label>
          <input
            id="full_name"
            required
            minLength={2}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Ayesha Khan"
          />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="ayesha@example.com"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <span className="field-hint">At least 8 characters.</span>
        </div>
        <div className="field">
          <label htmlFor="headline">Headline</label>
          <input
            id="headline"
            value={form.headline}
            onChange={(e) => setForm({ ...form, headline: e.target.value })}
            placeholder="Backend engineer, distributed systems"
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="years">Years of experience</label>
            <input
              id="years"
              type="number"
              min={0}
              max={60}
              value={form.years_experience}
              onChange={(e) => setForm({ ...form, years_experience: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="skills">Skills</label>
            <input
              id="skills"
              value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
              placeholder="python, fastapi"
            />
          </div>
        </div>

        <ErrorNotice error={error} />

        <button type="submit" className="primary" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </button>
        <p className="muted">
          Already registered? <Link to="/login">Sign in</Link>.
        </p>
      </form>
    </div>
  );
}
