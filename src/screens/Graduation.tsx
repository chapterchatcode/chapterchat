import { Button } from "../components/Button";
import { Staircase } from "../components/Staircase";
import { useSurface } from "../hooks";

/**
 * It ends with a graduation, not a renewal screen.
 * The staircase is the flow-channel ramp the product is built on, drawn once,
 * at the end, as the shape of what they did. No confetti — a single fade-up.
 */
export function Graduation({ onDone }: { onDone: () => void }) {
  useSurface("paper");
  return (
    <div className="screen">
      <div className="grow rise--slow" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Staircase />
        <h1 className="display display--lg">You're done.</h1>
        <p
          style={{
            fontFamily: "var(--font-read)",
            fontSize: "1.0625rem",
            lineHeight: 1.62,
            color: "var(--ink-2)",
            marginTop: 20,
            maxWidth: "27ch",
          }}
        >
          Thirty minutes, seven times, with the phone somewhere else. That's not a streak. That's a reader.
        </p>
      </div>
      <div className="foot">
        <Button onClick={onDone}>Back to your books</Button>
      </div>
    </div>
  );
}
