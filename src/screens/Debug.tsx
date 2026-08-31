import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { useSurface } from "../hooks";
import { funnel, type FunnelStats } from "../service";
import { getProfile, storageEstimate, exportBackup } from "../storage";
import { getPrefs } from "../prefs";

/** Route /debug. Never linked — reachable only by typing the URL. */
export function Debug() {
  useSurface("paper");
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const profile = await getProfile();
      setStats(await funnel(profile, getPrefs().bookClubCode));
      setStorage(await storageEstimate());
      setPersisted(getPrefs().storagePersisted);
    })();
  }, []);

  const copy = async () => {
    const text = JSON.stringify({ stats, storage, persisted, backup: await exportBackup() }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
  };

  const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

  return (
    <div className="screen debug">
      <div style={{ padding: "22px 0 10px" }}>
        <h1 className="display display--sm">/debug · v2</h1>
        <p className="hint">Local data only. Nothing is sent anywhere.</p>
      </div>

      {!stats ? (
        <p className="hint">Reading local data…</p>
      ) : (
        <pre>
{`FUNNEL
  signed up ............ ${stats.signedUp}
  article completed .... ${stats.articleDone}
  day one .............. ${stats.dayOne}
  graduated ............ ${stats.graduated}
  book club code ....... ${stats.bookClubCode ?? "(skipped)"}

RAMP  (paragraphs)
  chunk size ........... ${stats.chunkParagraphs}
  grow run ............. ${stats.growRun} of 2
  ease-off run ......... ${stats.shrinkRun} of 2

BOOK
  chapters ............. ${stats.chapters}

GRADUATION
  qualifying days /14 .. ${stats.qualifyingDaysLast14} of 7

RAMP HISTORY
${stats.rampHistory.length
  ? stats.rampHistory.map((r) => `  ${r.at}  ${r.from} -> ${r.to} para  (${r.reason})`).join("\n")
  : "  none"}

STORAGE
  events ............... ${stats.events}
  persist() granted .... ${persisted === null ? "unknown" : persisted}
  usage ................ ${storage ? `${mb(storage.usage)} of ${mb(storage.quota)}` : "unavailable"}`}
        </pre>
      )}

      <div className="grow" />
      <div className="foot">
        <Button variant="secondary" onClick={copy}>{copied ? "Copied" : "Copy JSON"}</Button>
      </div>
    </div>
  );
}
