import {
  AlertTriangle,
  Clock3,
  Coins,
  Gauge,
  Sparkles,
} from "lucide-react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  formatDurationMinutes,
  formatNumber,
  formatShortTime,
  formatCurrency,
  formatSeconds,
} from "../format";
import {
  doughnutOptions,
  stackedBarChartOptions,
  tempHumidityChartOptions,
} from "../chartConfig";
import {
  EmptyState,
  MetricCard,
  Panel,
  SensorCard,
  StatusPill,
  TimelineRow,
} from "../ui";

export function OverviewView({
  activeEvents,
  dailyPerformanceChart,
  helpfulTips,
  liveStatus,
  overviewTimelineWindows,
  tempHumidityChart,
  todayAnalytics,
  totalMonitoredMinutes,
  wasteBreakdownChart,
}) {
  const noMotionSeconds = liveStatus?.noMotionSeconds || 0;
  const fanWasteMinutes = todayAnalytics?.fanWasteMinutes || 0;
  const lightWasteMinutes = todayAnalytics?.lightWasteMinutes || 0;
  const hasWasteData = fanWasteMinutes > 0 || lightWasteMinutes > 0;
  const totalWindows = overviewTimelineWindows.length;
  const occupiedWindows = overviewTimelineWindows.filter((window) => window.motionDetected).length;
  const vacantWindows = totalWindows - occupiedWindows;
  const fanOnWindows = overviewTimelineWindows.filter((window) => window.fanOn).length;
  const lightingWindows = overviewTimelineWindows.filter((window) => window.lampOn).length;
  const wasteWindows = overviewTimelineWindows.filter(
    (window) => window.fanWaste || window.lightWaste
  ).length;
  const occupancyMeta =
    noMotionSeconds > 0
      ? `Last motion: ${formatSeconds(noMotionSeconds)} ago`
      : "Motion detected now";

  return (
    <>
      <section className="metric-grid five">
        <MetricCard
          label="Monitored Today"
          value={`${formatNumber(totalMonitoredMinutes / 60, 1)} h`}
          accent="neutral"
          icon={<Clock3 size={18} />}
        />
        <MetricCard
          label="Waste today"
          value={`${formatNumber(todayAnalytics?.totalWasteMinutes || 0, 1)} min`}
          accent="critical"
          icon={<AlertTriangle size={18} />}
        />
        <MetricCard
          label="Habit score"
          value={`${todayAnalytics?.habitScore ?? "--"}/100`}
          accent="warning"
          icon={<Gauge size={18} />}
        />
        <MetricCard
          label="Potential saving"
          value={formatCurrency(todayAnalytics?.estimatedCostLKR || 0)}
          accent="healthy"
          icon={<Coins size={18} />}
        />
        <MetricCard
          label="Active events"
          value={String(activeEvents.length)}
          accent={activeEvents.length > 0 ? "critical" : "healthy"}
          icon={<Sparkles size={18} />}
        />
      </section>

      <section className="content-grid">
        <Panel
          title="Realtime room state"
          subtitle="Live sensor status"
          badge={<StatusPill tone="healthy">Live</StatusPill>}
        >
          <div className="sensor-grid">
            <SensorCard
              label="Occupancy"
              value={liveStatus?.motionDetected ? "Occupied" : "Vacant"}
              meta={occupancyMeta}
              tone={liveStatus?.motionDetected ? "healthy" : "critical"}
            />
            <SensorCard
              label="Temperature"
              value={`${formatNumber(liveStatus?.temperature, 1)} C`}
              meta={`Today avg: ${formatNumber(todayAnalytics?.avgTemperature, 1)} C`}
              tone="warning"
            />
            <SensorCard
              label="Humidity"
              value={`${formatNumber(liveStatus?.humidity, 1)} %`}
              meta={`Today avg: ${formatNumber(todayAnalytics?.avgHumidity, 1)} %`}
              tone="neutral"
            />
            <SensorCard
              label="Lighting"
              value={liveStatus?.lampOn ? "On" : "Off"}
              meta={
                liveStatus?.lightWaste
                  ? "Lighting waste detected"
                  : liveStatus?.lampOn
                    ? "Lamp is turned on"
                    : "Lamp is turned off"
              }
              tone={liveStatus?.lightWaste ? "critical" : liveStatus?.lampOn ? "warning" : "muted"}
            />
            <SensorCard
              label="Fan"
              value={liveStatus?.fanOn ? "On" : "Off"}
              meta={
                liveStatus?.fanWaste
                  ? "Fan waste detected"
                  : liveStatus?.fanOn
                    ? "Fan is running"
                    : "Fan is off"
              }
              tone={liveStatus?.fanWaste ? "critical" : liveStatus?.fanOn ? "power" : "muted"}
            />
          </div>
        </Panel>
      </section>

      <section className="content-grid two-column">
        <Panel
          title="Waste distribution"
          subtitle="Monitored Waste"
        >
          {hasWasteData ? (
            <div className="donut-layout">
              <div className="chart-box compact">
                <Doughnut data={wasteBreakdownChart} options={doughnutOptions} />
              </div>
              <div className="legend-stack">
                <div className="legend-row">
                  <span className="legend-dot tone-power" />
                  <div>
                    <strong>{formatDurationMinutes(fanWasteMinutes)}</strong>
                    <small>Fan waste</small>
                  </div>
                </div>
                <div className="legend-row">
                  <span className="legend-dot tone-warning" />
                  <div>
                    <strong>{formatDurationMinutes(lightWasteMinutes)}</strong>
                    <small>Light waste</small>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No waste detected today"
              detail="No fan or lighting waste has been recorded so far."
            />
          )}
        </Panel>

        <Panel
          title="Smart recommendations"
          subtitle="Helpful Tips"
        >
          {helpfulTips.length > 0 ? (
            <div className="recommendation-list">
              {helpfulTips.map((recommendation, index) => (
                <article key={`${recommendation}-${index}`} className="recommendation-card">
                  <Sparkles size={16} />
                  <p>{recommendation}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No tips yet"
              detail="Helpful tips will appear after the system watches the room a little longer."
            />
          )}
        </Panel>
      </section>

      <section className="content-grid two-column">
        <Panel
          title="Recent trend"
          subtitle="Temperature and humidity"
        >
          <div className="chart-box">
            <Line data={tempHumidityChart} options={tempHumidityChartOptions} />
          </div>
        </Panel>

        <Panel
          title="10-minute windows"
          subtitle="Occupancy and Appliance Quick Look"
          action={<span>Last 2 hours</span>}
          className="quick-look-panel"
        >
          {overviewTimelineWindows.length > 0 ? (
            <div className="timeline-panel">
              <TimelineRow label="Occupancy" items={overviewTimelineWindows} mode="occupancy" />
              <TimelineRow label="Fan" items={overviewTimelineWindows} mode="appliances" />
              <TimelineRow label="Lighting" items={overviewTimelineWindows} mode="lighting" />
              <TimelineRow label="Waste" items={overviewTimelineWindows} mode="waste" />
              <div className="timeline-scale">
                <span>{formatShortTime(overviewTimelineWindows[0]?.timestamp)}</span>
                <span>
                  {formatShortTime(
                    overviewTimelineWindows[overviewTimelineWindows.length - 1]?.endTime
                  )}
                </span>
              </div>
              <div className="timeline-insights">
                <span className="timeline-insight tone-occupied">
                  <small>Occupied</small>
                  <strong>{occupiedWindows} windows</strong>
                </span>
                <span className="timeline-insight tone-muted">
                  <small>Vacant</small>
                  <strong>{vacantWindows} windows</strong>
                </span>
                <span className="timeline-insight tone-power">
                  <small>Fan On</small>
                  <strong>{fanOnWindows} windows</strong>
                </span>
                <span className="timeline-insight tone-lighting">
                  <small>Lamp On</small>
                  <strong>{lightingWindows} windows</strong>
                </span>
                <span className="timeline-insight tone-waste">
                  <small>Waste</small>
                  <strong>{wasteWindows} windows</strong>
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No recent timeline available"
              detail="The 10-minute timeline will appear after a few more readings are stored."
            />
          )}
        </Panel>
      </section>

      <section className="content-grid">
        <Panel
          title="Daily Waste"
          subtitle="Fan / Light Waste for the Past 7 Days"
          action={<span>7 day view</span>}
        >
          <div className="chart-box">
            <Bar data={dailyPerformanceChart} options={stackedBarChartOptions} />
          </div>
        </Panel>
      </section>
    </>
  );
}
