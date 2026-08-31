import { useState } from "react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";

/**
 * There is no server to authenticate against, so these screens write a local
 * profile record. They are kept exactly as specified so the flow is tested
 * before any sync exists. (CONTEXT §7.5 — still open.)
 */

function SocialRow() {
  return (
    <>
      <div className="orline">
        <i className="orline__line" />
        <span className="orline__text">or</span>
        <i className="orline__line" />
      </div>
      <div className="socials">
        <span className="soc" aria-hidden="true">G</span>
        <span className="soc" aria-hidden="true">A</span>
        <span className="soc" aria-hidden="true">✉</span>
      </div>
    </>
  );
}

function Terms() {
  return (
    <p className="terms">
      By continuing you agree to our <b>Terms of Service</b> and <b>Privacy Policy</b>.
    </p>
  );
}

interface CreateProps {
  onBack: () => void;
  onSubmit: (name: string, email: string) => void;
  onSignIn: () => void;
}

export function CreateAccount({ onBack, onSubmit, onSignIn }: CreateProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return setError("Enter your name to continue.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("That email address isn't complete.");
    if (password.length < 6) return setError("Use at least six characters.");
    setError(null);
    onSubmit(name.trim(), email.trim());
  };

  return (
    <div className="screen screen--centred">
      <div className="nav">
        <button type="button" className="nav__back" onClick={onBack} aria-label="Back">←</button>
      </div>

      <div style={{ marginTop: 22 }}>
        <h1 className="display" style={{ fontSize: "1.8125rem" }}>Create account</h1>
        <p className="sub" style={{ maxWidth: "30ch" }}>Save your place, your pace, and your books.</p>
      </div>

      <div style={{ marginTop: 24, textAlign: "left" }}>
        <Input icon="user" value={name} onChange={setName} placeholder="Full name" autoComplete="name" />
        <Input icon="mail" type="email" inputMode="email" value={email} onChange={setEmail}
               placeholder="Email address" autoComplete="email" />
        <Input icon="lock" type="password" value={password} onChange={setPassword}
               placeholder="Password" autoComplete="new-password" onEnter={submit} />
        {error && <p className="hint hint--error" style={{ marginTop: 2 }}>{error}</p>}
      </div>

      <Button style={{ marginTop: 14 }} onClick={submit}>Create account</Button>

      <p style={{ fontSize: "0.8125rem", color: "var(--ink-2)", marginTop: 14 }}>
        Already have an account?{" "}
        <button type="button" onClick={onSignIn}
                style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "underline" }}>
          Sign in
        </button>
      </p>

      <SocialRow />
      <div className="grow" />
      <div className="foot"><Terms /></div>
    </div>
  );
}

interface SignInProps {
  onBack: () => void;
  onSubmit: (email: string) => void;
  onCreate: () => void;
}

export function SignIn({ onBack, onSubmit, onCreate }: SignInProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("That email address isn't complete.");
    if (!password) return setError("Enter your password to continue.");
    setError(null);
    onSubmit(email.trim());
  };

  return (
    <div className="screen screen--centred">
      <div className="nav">
        <button type="button" className="nav__back" onClick={onBack} aria-label="Back">←</button>
      </div>

      <div style={{ marginTop: 22 }}>
        <h1 className="display" style={{ fontSize: "1.8125rem" }}>Welcome back</h1>
        <p className="sub" style={{ maxWidth: "30ch" }}>Pick up where you left off.</p>
      </div>

      <div style={{ marginTop: 24, textAlign: "left" }}>
        <Input icon="mail" type="email" inputMode="email" value={email} onChange={setEmail}
               placeholder="Email address" autoComplete="email" />
        <Input icon="lock" type="password" value={password} onChange={setPassword}
               placeholder="Password" autoComplete="current-password" onEnter={submit} />
        {error && <p className="hint hint--error" style={{ marginTop: 2 }}>{error}</p>}
        <p style={{ textAlign: "right", fontSize: "0.8125rem", color: "var(--ink-2)", marginTop: 2 }}>
          Forgot password
        </p>
      </div>

      <Button style={{ marginTop: 14 }} onClick={submit}>Sign in</Button>

      <p style={{ fontSize: "0.8125rem", color: "var(--ink-2)", marginTop: 14 }}>
        New here?{" "}
        <button type="button" onClick={onCreate}
                style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "underline" }}>
          Create an account
        </button>
      </p>

      <SocialRow />
      <div className="grow" />
      <div className="foot"><Terms /></div>
    </div>
  );
}
