import { Coins, Fan, Gauge, Lightbulb } from "lucide-react";
import { Bar, Line } from "react-chartjs-2";
import { baseChartOptions } from "../chartConfig";
import {
  formatCurrency,
  formatDurationMinutes,
} from "../format";
import { MetricCard, Panel, StatusPill } from "../ui";

export function PowerView({
  liveStatus,
  powerSignalChart,
  powerStateBreakdownChart,
  powerUsageByHourChart,
  todayAnalytics,
}) {
  const estimatedWasteCost = todayAnalytics?.estimatedCostLKR || 0;
  const fanTone = liveStatus?.fanWaste ? "critical" : liveStatus?.fanOn ? "power" : "muted";
  const lampTone = liveStatus?.lightWaste ? "critical" : liveStatus?.lampOn ? "warning" : "muted";
  const durationTick = (value) => formatDurationMinutes(Number(value));
  const durationChartOptions = {
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      tooltip: {
        ...baseChartOptions.plugins.tooltip,
        callbacks: {
          label: (context) =>
            `${context.dataset.label}: ${formatDurationMinutes(context.parsed.y || 0)}`,
        },
      },
    },
    scales: {
      ...baseChartOptions.scales,
      y: {
        ...baseChartOptions.scales.y,
        ticks: {
          ...baseChartOptions.scales.y.ticks,
          callback: durationTick,
        },
      },
    },
  };
  const breakdownChartOptions = {
    ...durationChartOptions,
    plugins: {
      ...durationChartOptions.plugins,
      tooltip: {
        ...durationChartOptions.plugins.tooltip,
        callbacks: {
          label: (context) => {
            const applianceLabel = context.label;
            const datasetLabel =
              context.dataset.label === "ON time"
                ? `${applianceLabel} ON time`
                : `${applianceLabel} waste`;

            return `${datasetLabel}: ${formatDurationMinutes(context.parsed.y || 0)}`;
          },
        },
      },
    },
  };

  return (
    <>
      <section className="metric-grid four power-metric-grid">
        <article className="metric-card appliance-status-card">
          <div className="metric-topline">
            <div>
              <p>Appliance status now</p>
            </div>
            <div className="appliance-status-icons">
              <div className="metric-icon accent-power">
                <Fan size={18} />
              </div>
              <div className="metric-icon accent-warning">
                <Lightbulb size={18} />
              </div>
            </div>
          </div>

          <div className="appliance-status-grid">
            <div className="appliance-status-item">
              <strong>Fan</strong>
              <StatusPill tone={fanTone}>
                {liveStatus?.fanOn ? "ON" : "OFF"}
              </StatusPill>
            </div>

            <div className="appliance-status-item">
              <strong>Lamp</strong>
              <StatusPill tone={lampTone}>
                {liveStatus?.lampOn ? "ON" : "OFF"}
              </StatusPill>
            </div>
          </div>
        </article>
        <MetricCard
          label="Fan runtime today"
          value={formatDurationMinutes(todayAnalytics?.fanRuntimeMinutes || 0)}
          accent="power"
          icon={<Gauge size={18} />}
        />
        <MetricCard
          label="Lamp runtime today"
          value={formatDurationMinutes(todayAnalytics?.lampRuntimeMinutes || 0)}
          accent="warning"
          icon={<Lightbulb size={18} />}
        />
        <MetricCard
          label="Estimated waste today"
          value={formatCurrency(estimatedWasteCost)}
          accent="critical"
          icon={<Coins size={18} />}
        />
      </section>

      <Panel
        title="Current draw trend"
        subtitle="Recent Fan Signal"
      >
        <div className="chart-box">
          <Line data={powerSignalChart} options={baseChartOptions} />
        </div>
      </Panel>

      <section className="content-grid two-column">
        <Panel title="Appliance time breakdown" subtitle="Runtime versus waste today">
          <div className="chart-box">
            <Bar data={powerStateBreakdownChart} options={breakdownChartOptions} />
          </div>
        </Panel>

        <Panel title="Appliance usage by hour" subtitle="When the fan and lamp were active today">
          <div className="chart-box">
            <Bar data={powerUsageByHourChart} options={durationChartOptions} />
          </div>
        </Panel>
      </section>
    </>
  );
}
