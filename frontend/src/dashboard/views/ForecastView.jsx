import { BrainCircuit, ChartColumn as ChartIcon, Gauge, Sparkles } from "lucide-react";
import { Line } from "react-chartjs-2";
import { baseChartOptions } from "../chartConfig";
import {
  buildForecastActionGroups,
  formatNumber,
  getCorrelationExplanation,
  getFeatureSupportText,
  getFriendlyFeatureLabel,
} from "../format";
import { EmptyState, MetricCard, Panel } from "../ui";

function getUsageCheckValue(latestComparison) {
  if (!latestComparison?.comparisonLevel) {
    return "Not ready";
  }

  if (latestComparison.comparisonLevel === "higher_than_expected") {
    return "Higher than usual";
  }

  if (latestComparison.comparisonLevel === "lower_than_expected") {
    return "Lower than usual";
  }

  return "Normal";
}

function getUsageCheckAccent(latestComparison) {
  if (!latestComparison?.comparisonLevel) {
    return "neutral";
  }

  if (latestComparison.comparisonLevel === "higher_than_expected") {
    return "critical";
  }

  if (latestComparison.comparisonLevel === "lower_than_expected") {
    return "power";
  }

  return "healthy";
}

export function ForecastView({
  forecastComparisonChart,
  mlResult,
  nextHourWasteChart,
  topRecommendations,
}) {
  const latestForecast = mlResult?.nextHourWastePrediction?.forecast;
  const latestComparison = mlResult?.expectedFanUsagePrediction?.latestComparison;
  const topRelationships = mlResult?.correlationAnalysis?.topRelationships || [];
  const featureDrivers =
    mlResult?.expectedFanUsagePrediction?.featureImportance?.slice(0, 5) || [];
  const actionGroups = buildForecastActionGroups({
    mlResult,
    recommendations: topRecommendations,
  });

  return (
    <>
      <section className="metric-grid four">
        <MetricCard
          label="Readings studied"
          value={String(mlResult?.dataRange?.totalRecords ?? "--")}
          accent="accent"
          icon={<BrainCircuit size={18} />}
        />
        <MetricCard
          label="Learned room patterns"
          value={String(mlResult?.dataRange?.totalHourlyProfiles ?? "--")}
          accent="neutral"
          icon={<ChartIcon size={18} />}
        />
        <MetricCard
          label="Chance of waste next hour"
          value={
            latestForecast ? (
              <>
                <span>{latestForecast.riskLevel}</span>
                <span className="metric-inline-note">
                  about {formatNumber(latestForecast.predictedNextHourWasteMinutes, 1)} min
                </span>
              </>
            ) : (
              "Not ready"
            )
          }
          accent={
            latestForecast?.riskLevel === "High"
              ? "critical"
              : latestForecast?.riskLevel === "Medium"
                ? "warning"
                : "healthy"
          }
          icon={<Gauge size={18} />}
        />
        <MetricCard
          label="Current usage check"
          value={getUsageCheckValue(latestComparison)}
          accent={getUsageCheckAccent(latestComparison)}
          icon={<Sparkles size={18} />}
        />
      </section>

      <section className="content-grid two-column">
        <Panel
          title="Expected versus actual"
          subtitle="Actual Vs Predicted Fan Current Usage Pattern"
        >
          {forecastComparisonChart.labels.length > 0 ? (
            <div className="chart-box">
              <Line data={forecastComparisonChart} options={baseChartOptions} />
            </div>
          ) : (
            <EmptyState
              title="Comparison data is not ready yet"
              detail="The system needs more clean readings before it can compare usual and current fan behaviour."
            />
          )}
        </Panel>

        <Panel
          title="Next-hour forecast"
          subtitle="Waste Prediction History"
        >
          {nextHourWasteChart.labels.length > 0 ? (
            <div className="chart-box">
              <Line data={nextHourWasteChart} options={baseChartOptions} />
            </div>
          ) : (
            <EmptyState
              title="Forecast history is not ready yet"
              detail="The system needs more hourly history before next-hour forecasts become useful."
            />
          )}
        </Panel>
      </section>

      <section className="content-grid two-column">
        <Panel
          title="Main reasons for this forecast"
          subtitle="Feature importance"
        >
          {featureDrivers.length > 0 ? (
            <div className="stack-list">
              {featureDrivers.map((item) => (
                <div key={item.feature} className="stack-row">
                  <div>
                    <strong>{getFriendlyFeatureLabel(item.feature)}</strong>
                    <small>{getFeatureSupportText(item.feature)}</small>
                  </div>
                  <div className="stack-value">
                    <span>{formatNumber(item.importance * 100, 1)}%</span>
                    <div className="micro-bar">
                      <span style={{ width: `${item.importance * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No forecast reasons yet"
              detail="The latest ML run did not include enough history to explain this forecast."
            />
          )}
        </Panel>

        <Panel
          title="Patterns the system noticed"
          subtitle="Correlation signals"
        >
          {topRelationships.length > 0 ? (
            <div className="stack-list">
              {topRelationships.map((item) => (
                <div key={item.feature} className="stack-row">
                  <div>
                    <strong>{getFriendlyFeatureLabel(item.feature)}</strong>
                    <small>{getCorrelationExplanation(item.feature, item.correlationWithWaste)}</small>
                  </div>
                  <div className="stack-value">
                    <span>{formatNumber(item.correlationWithWaste, 3)}</span>
                    <div className="micro-bar">
                      <span
                        style={{
                          width: `${Math.min(
                            Math.abs(item.correlationWithWaste) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No pattern summary yet"
              detail="The system needs more readings before it can highlight reliable waste patterns."
            />
          )}
        </Panel>
      </section>

      <Panel
        title="Suggested actions"
        subtitle="Do now, watch later, and usual high-risk times"
      >
        {actionGroups.length > 0 ? (
          <div className="recommendation-groups">
            {actionGroups.map((group) => (
              <section key={group.title} className="recommendation-group">
                <div className="recommendation-group-head">
                  <h4>{group.title}</h4>
                  <small>{group.subtitle}</small>
                </div>
                <div className="recommendation-list">
                  {group.items.map((recommendation, index) => (
                    <article key={`${group.title}-${index}`} className="recommendation-card">
                      <BrainCircuit size={16} />
                      <p>{recommendation}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No suggestions yet"
            detail="Keep the system running a little longer and suggestions will appear here."
          />
        )}
      </Panel>
    </>
  );
}
