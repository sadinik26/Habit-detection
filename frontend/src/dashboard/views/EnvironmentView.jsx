import { Activity, Droplets, Thermometer, Wifi } from "lucide-react";
import { Bar, Line } from "react-chartjs-2";
import { baseChartOptions, tempHumidityChartOptions } from "../chartConfig";
import {
  formatDurationMinutes,
  formatNumber,
  formatSeconds,
} from "../format";
import {
  EmptyState,
  MetricCard,
  Panel,
  StatusPill,
} from "../ui";

const COMFORT_TEMP_MIN = 26;
const COMFORT_TEMP_MAX = 30;
const COMFORT_SCALE_MIN = 24;
const COMFORT_SCALE_MAX = 36;

export function EnvironmentView({
  liveStatus,
  motionByHourChart,
  recentReadings,
  tempHumidityChart,
  todayAnalytics,
  totalMonitoredMinutes,
}) {
  const temperatureSamples = (recentReadings || [])
    .map((reading) => Number(reading.temperature))
    .filter((value) => Number.isFinite(value));

  const maxTemperature = temperatureSamples.length
    ? Math.max(...temperatureSamples)
    : null;
  const minTemperature = temperatureSamples.length
    ? Math.min(...temperatureSamples)
    : null;
  const avgTemperature = temperatureSamples.length
    ? temperatureSamples.reduce((sum, value) => sum + value, 0) / temperatureSamples.length
    : null;

  const comfortSampleCount = temperatureSamples.filter(
    (value) => value >= COMFORT_TEMP_MIN && value <= COMFORT_TEMP_MAX
  ).length;
  const comfortPercent = temperatureSamples.length
    ? (comfortSampleCount / temperatureSamples.length) * 100
    : 0;

  const currentTemperature = Number(liveStatus?.temperature);
  const comfortMarkerPercent = Number.isFinite(currentTemperature)
    ? Math.max(
        0,
        Math.min(
          100,
          ((currentTemperature - COMFORT_SCALE_MIN) /
            (COMFORT_SCALE_MAX - COMFORT_SCALE_MIN)) *
            100
        )
      )
    : 0;
  const comfortRangeStartPercent =
    ((COMFORT_TEMP_MIN - COMFORT_SCALE_MIN) /
      (COMFORT_SCALE_MAX - COMFORT_SCALE_MIN)) *
    100;
  const comfortRangeWidthPercent =
    ((COMFORT_TEMP_MAX - COMFORT_TEMP_MIN) /
      (COMFORT_SCALE_MAX - COMFORT_SCALE_MIN)) *
    100;

  let comfortStatus = "Within comfort band";

  if (Number.isFinite(currentTemperature)) {
    if (currentTemperature < COMFORT_TEMP_MIN) {
      comfortStatus = "Below comfort band";
    } else if (currentTemperature > COMFORT_TEMP_MAX) {
      comfortStatus = "Above comfort band";
    }
  }

  return (
    <>
      <section className="metric-grid four">
        <MetricCard
          label="Indoor temperature"
          value={`${formatNumber(liveStatus?.temperature, 1)} C`}
          meta={`Avg today ${formatNumber(todayAnalytics?.avgTemperature, 1)} C`}
          accent="warning"
          icon={<Thermometer size={18} />}
        />
        <MetricCard
          label="Relative humidity"
          value={`${formatNumber(liveStatus?.humidity, 1)} %`}
          meta={`Avg today ${formatNumber(todayAnalytics?.avgHumidity, 1)} %`}
          accent="neutral"
          icon={<Droplets size={18} />}
        />
        <MetricCard
          label="Occupied today"
          value={formatDurationMinutes(todayAnalytics?.occupiedMinutes || 0)}
          meta="Presence inferred from motion hold state"
          accent="healthy"
          icon={<Activity size={18} />}
        />
        <MetricCard
          label="Current room state"
          value={liveStatus?.motionDetected ? "Occupied" : "Vacant"}
          meta={`No motion ${formatSeconds(liveStatus?.noMotionSeconds || 0)}`}
          accent={liveStatus?.motionDetected ? "healthy" : "critical"}
          icon={<Wifi size={18} />}
        />
      </section>

      <Panel
        title="Environment trend"
        subtitle="Temperature and humidity over recent intervals"
        badge={<StatusPill tone="healthy">Live feed</StatusPill>}
      >
        <div className="chart-box">
          <Line data={tempHumidityChart} options={tempHumidityChartOptions} />
        </div>
      </Panel>

      <section className="content-grid two-column">
        <Panel title="Occupancy pattern" subtitle="Occupied time by hour">
          <div className="chart-box">
            <Bar data={motionByHourChart} options={baseChartOptions} />
          </div>
        </Panel>

        <Panel title="Temperature comfort summary" subtitle="Highest, lowest, average, and comfort band">
          {temperatureSamples.length > 0 ? (
            <div className="environment-summary">
              <div className="environment-summary-grid">
                <article className="environment-summary-card tone-critical">
                  <span>Highest temp</span>
                  <strong>{formatNumber(maxTemperature, 1)} C</strong>
                  <small>Recent peak reading</small>
                </article>

                <article className="environment-summary-card tone-power">
                  <span>Lowest temp</span>
                  <strong>{formatNumber(minTemperature, 1)} C</strong>
                  <small>Recent coolest reading</small>
                </article>

                <article className="environment-summary-card tone-warning">
                  <span>Average temp</span>
                  <strong>{formatNumber(avgTemperature, 1)} C</strong>
                  <small>Across recent intervals</small>
                </article>

                <article className="environment-summary-card tone-healthy">
                  <span>Within comfort band</span>
                  <strong>{formatNumber(comfortPercent, 0)}%</strong>
                  <small>
                    {comfortSampleCount} of {temperatureSamples.length} readings
                  </small>
                </article>
              </div>

              <div className="comfort-band-card">
                <div className="comfort-band-head">
                  <div>
                    <strong>{comfortStatus}</strong>
                    <small>
                      Comfort target: {COMFORT_TEMP_MIN} C to {COMFORT_TEMP_MAX} C
                    </small>
                  </div>
                  <div className="comfort-band-current">
                    {Number.isFinite(currentTemperature)
                      ? `${formatNumber(currentTemperature, 1)} C now`
                      : "--"}
                  </div>
                </div>

                <div className="comfort-band-meter">
                  <span
                    className="comfort-band-range"
                    style={{
                      left: `${comfortRangeStartPercent}%`,
                      width: `${comfortRangeWidthPercent}%`,
                    }}
                  />
                  <span
                    className="comfort-band-marker"
                    style={{ left: `${comfortMarkerPercent}%` }}
                  />
                </div>

                <div className="comfort-band-scale">
                  <span>{COMFORT_SCALE_MIN} C</span>
                  <span>{COMFORT_TEMP_MIN} C</span>
                  <span>{COMFORT_TEMP_MAX} C</span>
                  <span>{COMFORT_SCALE_MAX} C</span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No temperature summary available"
              detail="Recent temperature readings will appear here after more data is stored."
            />
          )}
        </Panel>
      </section>
    </>
  );
}
