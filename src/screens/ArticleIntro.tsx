import { Button } from "../components/Button";
import { StepBar } from "../components/StepBar";
import { useSurface } from "../hooks";

/**
 * The first experience of the product is FINISHING something — one complete
 * piece with a real ending, roughly two minutes. The app times it silently to
 * get a real WPM figure.
 */
export function ArticleIntro({ onBegin, onBack }: { onBegin: () => void; onBack: () => void }) {
  useSurface("paper");
  return (
    <div className="screen">
      <StepBar progress={0.2} onBack={onBack} />
      <div style={{ marginTop: 32 }}>
        <h1 className="display">Start with something short</h1>
        <p className="sub">
          A two-minute read. Finish it, tell us how it felt, and we'll size your first day from there.
        </p>
      </div>
      <div className="grow" />
      <div className="foot">
        <Button onClick={onBegin}>Begin</Button>
      </div>
    </div>
  );
}
