import { Check, X } from "lucide-react";

/** Persistent round summary; per-note and per-measure feedback stays on the score. */
export default function PracticeResult({
  passed,
  complete = false,
}: {
  passed: boolean | null;
  complete?: boolean;
}) {
  const Icon = passed ? Check : X;
  const label = passed ? (complete ? "全部通过" : "本次通过") : "本次未通过";

  return (
    <div className="practice-result" role="status" aria-live="polite" data-passed={passed ?? undefined}>
      {passed !== null && (
        <>
          <Icon className="ui-icon" aria-hidden="true" focusable="false" />
          {label}
        </>
      )}
    </div>
  );
}
