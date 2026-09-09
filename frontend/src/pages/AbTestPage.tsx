import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { ABTestResult, VariantMetrics } from "../types";

const VARIANT_LABEL: Record<string, string> = {
  A: "A · Standard ranking (control)",
  B: "B · Personalized ranking (treatment)",
};

function VariantCard({ m, minSessions }: { m: VariantMetrics; minSessions: number }) {
  const enough = m.searchSessions >= minSessions;
  return (
    <div className="card" style={{ flex: 1, minWidth: 280 }}>
      <div className="row spread">
        <h3 style={{ margin: 0 }}>{VARIANT_LABEL[m.variant]}</h3>
        <span className="badge badge-primary">{m.users} users</span>
      </div>
      <div className="grid grid-kpi mt">
        <div className="kpi">
          <div className="kpi-label">Search sessions</div>
          <div className="kpi-value">{m.searchSessions}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">CTR (search → view)</div>
          <div className="kpi-value">{m.ctr}%</div>
          <div className="kpi-sub">{m.sessionsWithJobView} sessions</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Apply rate</div>
          <div className="kpi-value">{m.applyRate}%</div>
          <div className="kpi-sub">{m.sessionsWithApplication} sessions</div>
        </div>
      </div>
      <div className="muted small mt">
        Raw events: {m.totalSearches} searches · {m.totalJobViews} job views ·{" "}
        {m.totalApplications} applications
      </div>
      {!enough && (
        <div className="muted small mt">
          <span className="badge badge-warning">below threshold</span> fewer than {minSessions}{" "}
          search sessions — no conclusions from this arm yet.
        </div>
      )}
    </div>
  );
}

export default function AbTestPage() {
  const [data, setData] = useState<ABTestResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await api.abTestSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load A/B metrics");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assignMissing() {
    setBusy(true);
    setNote(null);
    try {
      const res = await api.abTestAssignMissing();
      setNote(`Assigned variants to ${res.assigned} previously unassigned user(s).`);
      setData(await api.abTestSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  const a = data?.variants.find((v) => v.variant === "A");
  const b = data?.variants.find((v) => v.variant === "B");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>A/B Experiment — Personalized Ranking</h1>
          <p className="muted small">
            Variant A: standard IR ranking (control). Variant B: IR ranking + personalization
            re-ranker (up to +15% boost from skill/location overlap). Assignment is a deterministic
            50/50 hash of the user id, persisted per user. All metrics come from stored SEARCH →
            JOB_VIEW → APPLICATION_SUBMITTED session funnels.
          </p>
        </div>
        <div className="row">
          <button className="btn btn-outline" onClick={() => void assignMissing()} disabled={busy}>
            Assign missing variants
          </button>
          <button className="btn btn-primary" onClick={() => void load()} disabled={busy}>
            {busy ? "Loading…" : "Refresh metrics"}
          </button>
        </div>
      </div>

      {error && <div className="card form-error">{error}</div>}
      {note && <div className="card">{note}</div>}
      {busy && !data && <div className="page-loading">Loading…</div>}

      {data && a && b && (
        <>
          <div className="row mt" style={{ alignItems: "stretch" }}>
            <VariantCard m={a} minSessions={data.significance.minSessionsPerVariant} />
            <VariantCard m={b} minSessions={data.significance.minSessionsPerVariant} />
          </div>

          <div className="card mt">
            <h2>Difference (B − A)</h2>
            <div className="grid grid-kpi">
              <div className="kpi">
                <div className="kpi-label">Δ CTR (percentage points)</div>
                <div className="kpi-value">
                  {data.delta.ctr === null ? "—" : `${data.delta.ctr > 0 ? "+" : ""}${data.delta.ctr}`}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Δ Apply rate (percentage points)</div>
                <div className="kpi-value">
                  {data.delta.applyRate === null
                    ? "—"
                    : `${data.delta.applyRate > 0 ? "+" : ""}${data.delta.applyRate}`}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Assigned users</div>
                <div className="kpi-value">{data.assignedUsers}</div>
                <div className="kpi-sub">
                  since {data.startedAt ? new Date(data.startedAt).toLocaleDateString() : "—"}
                </div>
              </div>
            </div>
            <p className={`mt ${data.significance.sufficientData ? "muted small" : "small"}`}>
              <span className={`badge ${data.significance.sufficientData ? "badge-success" : "badge-warning"}`}>
                {data.significance.sufficientData ? "minimum sample reached" : "insufficient data"}
              </span>{" "}
              {data.significance.note}
            </p>
          </div>

          <div className="card mt">
            <h3>Methodology notes</h3>
            <ul className="muted small">
              <li>
                Unit of assignment: user. Unit of analysis: search session (a session belongs to
                the user who emitted its first event).
              </li>
              <li>
                CTR = sessions with a JOB_VIEW after SEARCH ÷ sessions with SEARCH. Apply rate =
                sessions with APPLICATION_SUBMITTED after SEARCH ÷ sessions with SEARCH.
              </li>
              <li>
                {data.description}
              </li>
              <li>
                No statistical significance test is claimed — with this sample size the dashboard
                reports descriptive differences only.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
