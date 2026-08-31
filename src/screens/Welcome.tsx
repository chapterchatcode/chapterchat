import { Button } from "../components/Button";

/**
 * The hero is a sentence, not an illustration — set in the face they will read
 * the book in. No imagery, no logo mark, no gradient.
 */
export function Welcome({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <div className="screen">
      <div className="grow" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <p className="eyebrow" style={{ marginBottom: 22 }}>
          Reading, rebuilt
        </p>
        <h1 className="hero rise">
          You haven't lost the desire to read. You've lost the stamina.
        </h1>
        <p className="sub" style={{ marginTop: 20, maxWidth: "27ch" }}>
          We give you back one page at a time, until you don't need us.
        </p>
      </div>
      <div className="foot">
        <Button onClick={onStart}>Get started</Button>
        <Button variant="quiet" onClick={onSignIn} style={{ marginTop: 6 }}>
          I already have an account
        </Button>
      </div>
    </div>
  );
}
