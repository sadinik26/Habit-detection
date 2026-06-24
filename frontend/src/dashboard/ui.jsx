import { formatShortTime } from "./format";

export function StatusPill({ tone = "muted", children, subtle = false }) {
  return (
    <span className={`status-pill tone-${tone} ${subtle ? "subtle" : ""}`}>
      {children}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  badge,
  action,
  children,
  className = "",
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-header">
        <div>
          <p className="panel-eyebrow">{title}</p>
          {subtitle ? <h3>{subtitle}</h3> : null}
        </div>
        <div className="panel-actions">
          {badge ? badge : null}
          {action ? <div className="panel-action">{action}</div> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  meta,
  accent = "neutral",
  progress,
  icon,
  className = "",
}) {
  return (
    <article className={`metric-card ${className}`.trim()}>
      <div className="metric-topline">
        <div>
          <p>{label}</p>
          <h2 className={`accent-${accent}`}>{value}</h2>
        </div>
        {icon ? <div className={`metric-icon accent-${accent}`}>{icon}</div> : null}
      </div>
      {meta ? <small>{meta}</small> : null}
      {progress !== undefined ? (
        <div className="metric-progress">
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
    </article>
  );
}

export function SensorCard({ label, value, meta, tone = "neutral", footer }) {
  return (
    <article className={`sensor-card tone-${tone}`}>
      <p>{label}</p>
      <h4>{value}</h4>
      {meta ? <small>{meta}</small> : null}
      {footer ? <div className="sensor-footer">{footer}</div> : null}
    </article>
  );
}

export function NavButton({ active, onClick, badge, label, Icon }) {
  return (
    <button
      type="button"
      className={`nav-button ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="nav-icon">
        <Icon size={16} />
      </span>
      <span className="nav-label">{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </button>
  );
}

export function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <p>{title}</p>
      <span>{detail}</span>
    </div>
  );
}

export function TimelineRow({ label, items, mode }) {
  return (
    <div className="timeline-row">
      <div className="timeline-label">{label}</div>
      <div className="timeline-track">
        {items.map((item, index) => {
          let tone = "muted";

          if (mode === "occupancy") {
            tone = item.motionDetected
              ? "occupied"
              : item.fanWaste || item.lightWaste
                ? "critical"
                : "muted";
          } else if (mode === "appliances") {
            tone = item.fanOn
              ? item.fanWaste
                ? "critical"
                : "power"
              : "muted";
          } else if (mode === "lighting") {
            tone = item.lampOn
              ? item.lightWaste
                ? "warning"
                : "lighting"
              : "muted";
          } else if (mode === "waste") {
            tone = item.fanWaste
              ? "critical"
              : item.lightWaste
                ? "waste"
                : "muted";
          }

          return (
            <span
              key={`${mode}-${index}`}
              className={`timeline-segment tone-${tone}`}
              title={`${item.tooltipLabel || formatShortTime(item.timestamp)} | ${label}`}
            />
          );
        })}
      </div>
    </div>
  );
}
