import { formatCurrency, formatDateTime, formatDurationMinutes, toneForEvent } from "../format";
import { EmptyState, MetricCard, Panel, StatusPill } from "../ui";

const COLOMBO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const MIN_MEANINGFUL_WASTE_SECONDS = 5 * 60;
const MAX_VISIBLE_WASTE_EVENTS = 10;

function getEffectiveDurationSeconds(event, nowValue) {
  if (event?.durationSeconds) {
    return event.durationSeconds;
  }

  if (event?.status !== "ACTIVE" || !event?.startTime) {
    return 0;
  }

  const startMs = new Date(event.startTime).getTime();
  const nowMs = new Date(nowValue).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(nowMs)) {
    return 0;
  }

  return Math.max(0, Math.round((nowMs - startMs) / 1000));
}

function getColomboDayKey(value) {
  if (!value) {
    return "";
  }

  return COLOMBO_DATE_FORMATTER.format(new Date(value));
}

export function WasteView({ todayAnalytics, wasteEvents, ruleCards }) {
  const nowValue = new Date();
  const todayKey = getColomboDayKey(nowValue);
  const totalWasteMinutes = Number(todayAnalytics?.totalWasteMinutes || 0);
  const totalWasteCost = Number(todayAnalytics?.estimatedCostLKR || 0);

  const meaningfulWasteEvents = wasteEvents
    .map((event) => ({
      ...event,
      effectiveDurationSeconds: getEffectiveDurationSeconds(event, nowValue),
    }))
    .filter((event) => event.effectiveDurationSeconds >= MIN_MEANINGFUL_WASTE_SECONDS);

  const visibleWasteEvents = meaningfulWasteEvents.slice(0, MAX_VISIBLE_WASTE_EVENTS);
  const meaningfulEventsToday = meaningfulWasteEvents.filter(
    (event) => getColomboDayKey(event.startTime) === todayKey
  );
  const meaningfulWasteMinutesToday =
    meaningfulEventsToday.reduce((sum, event) => sum + event.effectiveDurationSeconds, 0) / 60;
  const meaningfulWasteCostToday =
    totalWasteMinutes > 0
      ? (meaningfulWasteMinutesToday / totalWasteMinutes) * totalWasteCost
      : 0;
  const longestMeaningfulWasteMinutes = Math.max(
    0,
    ...meaningfulWasteEvents.map((event) => event.effectiveDurationSeconds / 60)
  );

  return (
    <>
      <section className="metric-grid four">
        <MetricCard
          label="Events today"
          value={String(meaningfulEventsToday.length)}
          accent={meaningfulEventsToday.length > 0 ? "critical" : "healthy"}
        />
        <MetricCard
          label="Total waste time Today"
          value={formatDurationMinutes(meaningfulWasteMinutesToday)}
          accent="warning"
        />
        <MetricCard
          label="Estimated Waste cost For Today"
          value={formatCurrency(meaningfulWasteCostToday)}
          accent="warning"
        />
        <MetricCard
          label="Longest event"
          value={formatDurationMinutes(longestMeaningfulWasteMinutes)}
          accent="critical"
        />
      </section>

      <Panel
        title="Waste event log"
        subtitle="Recent events"
        badge={<StatusPill tone="critical">{visibleWasteEvents.length} shown</StatusPill>}
      >
        {visibleWasteEvents.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Triggered</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleWasteEvents.map((event) => (
                  <tr key={event._id}>
                    <td>{event._id?.slice(-6)?.toUpperCase() || "EVENT"}</td>
                    <td>{formatDateTime(event.startTime)}</td>
                    <td>
                      <StatusPill tone={toneForEvent(event)} subtle>
                        {event.type === "FAN_WASTE" ? "Fan waste" : "Light waste"}
                      </StatusPill>
                    </td>
                    <td>{event.reason}</td>
                    <td>{formatDurationMinutes(event.effectiveDurationSeconds / 60)}</td>
                    <td>
                      <StatusPill tone={event.status === "ACTIVE" ? "critical" : "healthy"}>
                        {event.status === "ACTIVE" ? "Active" : "Resolved"}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No Significant Waste Events Detected"
            detail="Only waste events lasting 5 minutes or more are shown here."
          />
        )}
      </Panel>

      <Panel
        title="Detection Criteria"
        subtitle="Active Rules"
        badge={<StatusPill tone="healthy">{ruleCards.length} rules</StatusPill>}
      >
        <div className="rules-grid">
          {ruleCards.map((rule) => (
            <article key={rule.title} className="rule-card">
              <div className="rule-card-top">
                <h4>{rule.title}</h4>
              </div>
              <p>{rule.detail}</p>
            </article>
          ))}
        </div>
      </Panel>
    </>
  );
}
