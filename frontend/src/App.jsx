import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import axios from "axios";
import { AlertTriangle, Clock3, Zap } from "lucide-react";
import { API_BASE, LIVE_REFRESH_MS, NAV_GROUPS, VIEW_META, VIEW_REFRESH_MS, RULE_CARDS } from "./dashboard/config";
import {
  buildContextualRecommendations,
  formatDateTime,
  formatHourLabel,
  formatSeconds,
  formatShortTime,
  formatTimeAgo,
  getDateKeyInColombo,
  getHourInColombo,
  toFriendlyRecommendation,
} from "./dashboard/format";
import { NavButton, StatusPill } from "./dashboard/ui";
import { ActiveViewRenderer } from "./dashboard/views/AppViews";
import "./App.css";

function App() {
  const [activeView, setActiveView] = useState("overview");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [liveStatus, setLiveStatus] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [recentReadings, setRecentReadings] = useState([]);
  const [wasteEvents, setWasteEvents] = useState([]);
  const [todayAnalytics, setTodayAnalytics] = useState(null);
  const [dailyAnalytics, setDailyAnalytics] = useState([]);
  const [hourlyAnalytics, setHourlyAnalytics] = useState([]);
  const [mlResult, setMlResult] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadingViews, setLoadingViews] = useState({
    overview: true,
    waste: false,
    forecast: false,
    environment: false,
    power: false,
  });

  const lastFetchedRef = useRef({});

  const setViewLoading = (view, isLoading) => {
    setLoadingViews((prev) => ({
      ...prev,
      [view]: isLoading,
    }));
  };

  const fetchLiveStatus = useEffectEvent(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/live-status`);

      startTransition(() => {
        setLiveStatus(response.data);
      });
    } catch (error) {
      console.error("Live status fetch error:", error.message);
    }
  });

  const fetchViewData = useEffectEvent(async (view, force = false) => {
    const refreshWindow = Math.min(12000, Math.floor(VIEW_REFRESH_MS[view] / 2));
    const lastFetched = lastFetchedRef.current[view];

    if (!force && lastFetched && Date.now() - lastFetched < refreshWindow) {
      return;
    }

    setViewLoading(view, true);

    try {
      if (view === "overview") {
        const [readingsRes, eventsRes, todayRes, dailyRes, mlRes] = await Promise.all([
          axios.get(`${API_BASE}/api/readings/recent?limit=240`),
          axios.get(`${API_BASE}/api/waste-events?limit=8`),
          axios.get(`${API_BASE}/api/analytics/today`),
          axios.get(`${API_BASE}/api/analytics/daily?days=7`),
          axios.get(`${API_BASE}/api/ml/latest`).catch(() => ({ data: null })),
        ]);

        startTransition(() => {
          setRecentReadings(readingsRes.data);
          setWasteEvents(eventsRes.data);
          setTodayAnalytics(todayRes.data);
          setDailyAnalytics(dailyRes.data);
          setMlResult(mlRes.data);
        });
      }

      if (view === "waste") {
        const [eventsRes, todayRes] = await Promise.all([
          axios.get(`${API_BASE}/api/waste-events?limit=36`),
          axios.get(`${API_BASE}/api/analytics/today`),
        ]);

        startTransition(() => {
          setWasteEvents(eventsRes.data);
          setTodayAnalytics(todayRes.data);
        });
      }

      if (view === "forecast") {
        const [mlRes, dailyRes] = await Promise.all([
          axios.get(`${API_BASE}/api/ml/latest`).catch(() => ({ data: null })),
          axios.get(`${API_BASE}/api/analytics/daily?days=7`),
        ]);

        startTransition(() => {
          setMlResult(mlRes.data);
          setDailyAnalytics(dailyRes.data);
        });
      }

      if (view === "environment") {
        const [readingsRes, todayRes, hourlyRes] = await Promise.all([
          axios.get(`${API_BASE}/api/readings/recent?limit=96`),
          axios.get(`${API_BASE}/api/analytics/today`),
          axios.get(`${API_BASE}/api/analytics/hourly?hours=24`),
        ]);

        startTransition(() => {
          setRecentReadings(readingsRes.data);
          setTodayAnalytics(todayRes.data);
          setHourlyAnalytics(hourlyRes.data);
        });
      }

      if (view === "power") {
        const [readingsRes, todayRes, eventsRes, hourlyRes] = await Promise.all([
          axios.get(`${API_BASE}/api/readings/recent?limit=96`),
          axios.get(`${API_BASE}/api/analytics/today`),
          axios.get(`${API_BASE}/api/waste-events?limit=12`),
          axios.get(`${API_BASE}/api/analytics/hourly?hours=24`),
        ]);

        startTransition(() => {
          setRecentReadings(readingsRes.data);
          setTodayAnalytics(todayRes.data);
          setWasteEvents(eventsRes.data);
          setHourlyAnalytics(hourlyRes.data);
        });
      }

      lastFetchedRef.current[view] = Date.now();
      setLoadError("");
    } catch (error) {
      console.error(`${view} data fetch error:`, error.message);
      setLoadError("Some analytics could not be refreshed right now.");
    } finally {
      setViewLoading(view, false);
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function initialise() {
      await Promise.allSettled([fetchLiveStatus(), fetchViewData("overview", true)]);

      if (!cancelled) {
        setBootstrapped(true);
      }
    }

    initialise();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bootstrapped) {
      return undefined;
    }

    const initialRefreshId = window.setTimeout(() => {
      fetchViewData(activeView);
    }, 0);

    const intervalId = window.setInterval(() => {
      fetchViewData(activeView, true);
    }, VIEW_REFRESH_MS[activeView]);

    return () => {
      window.clearTimeout(initialRefreshId);
      window.clearInterval(intervalId);
    };
  }, [activeView, bootstrapped]);

  useEffect(() => {
    if (!bootstrapped) {
      return undefined;
    }

    const clockInterval = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(clockInterval);
  }, [bootstrapped]);

  useEffect(() => {
    if (!bootstrapped) {
      return undefined;
    }

    const liveInterval = window.setInterval(() => {
      fetchLiveStatus();
    }, LIVE_REFRESH_MS);

    return () => window.clearInterval(liveInterval);
  }, [bootstrapped]);

  const activeEvents = wasteEvents.filter((event) => event.status === "ACTIVE");
  const sampleIntervalSeconds = todayAnalytics?.sampleIntervalSeconds || 30;
  const totalMonitoredMinutes =
    ((todayAnalytics?.totalReadings || 0) * sampleIntervalSeconds) / 60;
  const trendReadings = recentReadings.slice(-60);
  const timelineReadings = recentReadings.slice(-24);

  const tempHumidityChart = {
    labels: trendReadings.map((reading) => formatShortTime(reading.timestamp)),
    datasets: [
      {
        label: "Temperature (C)",
        data: trendReadings.map((reading) => reading.temperature),
        borderColor: "#ff7a7a",
        backgroundColor: "rgba(255, 122, 122, 0.12)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.35,
        fill: false,
        yAxisID: "temperature",
      },
      {
        label: "Humidity (%)",
        data: trendReadings.map((reading) => reading.humidity),
        borderColor: "#5aa7ff",
        backgroundColor: "rgba(90, 167, 255, 0.14)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.35,
        fill: false,
        yAxisID: "humidity",
      },
    ],
  };

  const overviewTimelineWindows = Array.from(
    recentReadings.reduce((windows, reading) => {
      if (!reading.timestamp) {
        return windows;
      }

      const timestampMs = new Date(reading.timestamp).getTime();

      if (Number.isNaN(timestampMs)) {
        return windows;
      }

      const bucketMs = 10 * 60 * 1000;
      const bucketStartMs = Math.floor(timestampMs / bucketMs) * bucketMs;
      const bucketEndMs = bucketStartMs + bucketMs;
      const key = String(bucketStartMs);

      if (!windows.has(key)) {
        windows.set(key, {
          startTime: new Date(bucketStartMs).toISOString(),
          endTime: new Date(bucketEndMs).toISOString(),
          samples: 0,
          occupiedCount: 0,
          fanOnCount: 0,
          lampOnCount: 0,
          fanWasteCount: 0,
          lightWasteCount: 0,
        });
      }

      const window = windows.get(key);
      window.samples += 1;
      window.occupiedCount += reading.motionDetected ? 1 : 0;
      window.fanOnCount += reading.fanOn ? 1 : 0;
      window.lampOnCount += reading.lampOn ? 1 : 0;
      window.fanWasteCount += reading.fanWaste ? 1 : 0;
      window.lightWasteCount += reading.lightWaste ? 1 : 0;

      return windows;
    }, new Map()).values()
  )
    .map((window) => ({
      timestamp: window.startTime,
      motionDetected: window.occupiedCount / Math.max(window.samples, 1) > 0.5,
      fanOn: window.fanOnCount / Math.max(window.samples, 1) > 0.5,
      lampOn: window.lampOnCount / Math.max(window.samples, 1) > 0.5,
      fanWaste: window.fanWasteCount / Math.max(window.samples, 1) > 0.5,
      lightWaste: window.lightWasteCount / Math.max(window.samples, 1) > 0.5,
      tooltipLabel: `${formatShortTime(window.startTime)} - ${formatShortTime(window.endTime)}`,
      endTime: window.endTime,
    }))
    .slice(-12);

  const wasteBreakdownChart = {
    labels: ["Fan waste", "Light waste"],
    datasets: [
      {
        data: [todayAnalytics?.fanWasteMinutes || 0, todayAnalytics?.lightWasteMinutes || 0],
        backgroundColor: ["#66a3ff", "#f5c042"],
        borderColor: ["#101a2d", "#2a2110"],
        borderWidth: 1,
      },
    ],
  };

  const dailyPerformanceChart = {
    labels: dailyAnalytics.map((item) => item.date),
    datasets: [
      {
        label: "Fan waste",
        data: dailyAnalytics.map((item) => item.fanWasteMinutes),
        backgroundColor: "rgba(255, 122, 122, 0.52)",
        borderColor: "#ff7a7a",
        borderRadius: 8,
        borderSkipped: false,
      },
      {
        label: "Light waste",
        data: dailyAnalytics.map((item) => item.lightWasteMinutes),
        backgroundColor: "rgba(255, 156, 84, 0.72)",
        borderColor: "#ff9c54",
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  };

  const forecastComparisonChart = {
    labels:
      mlResult?.expectedFanUsagePrediction?.recentComparisons?.map((item) =>
        formatShortTime(item.timestamp)
      ) || [],
    datasets: [
      {
        label: "Predicted fan current",
        data:
          mlResult?.expectedFanUsagePrediction?.recentComparisons?.map(
            (item) => item.expectedFanRms
          ) || [],
        borderColor: "#9b7cff",
        pointRadius: 0,
        tension: 0.34,
      },
      {
        label: "Actual fan current",
        data:
          mlResult?.expectedFanUsagePrediction?.recentComparisons?.map(
            (item) => item.actualFanRms
          ) || [],
        borderColor: "#35d7c0",
        pointRadius: 0,
        tension: 0.34,
      },
    ],
  };

  const nextHourWasteChart = {
    labels:
      mlResult?.nextHourWastePrediction?.recentPredictions?.map((item) =>
        formatShortTime(item.hourStart)
      ) || [],
    datasets: [
      {
        label: "Predicted next hour",
        data:
          mlResult?.nextHourWastePrediction?.recentPredictions?.map(
            (item) => item.predictedNextHourWasteMinutes
          ) || [],
        borderColor: "#f5c042",
        backgroundColor: "rgba(245, 192, 66, 0.14)",
        pointRadius: 0,
        tension: 0.32,
      },
      {
        label: "Actual next hour",
        data:
          mlResult?.nextHourWastePrediction?.recentPredictions?.map(
            (item) => item.actualNextHourWasteMinutes
          ) || [],
        borderColor: "#ff7a7a",
        backgroundColor: "rgba(255, 122, 122, 0.14)",
        pointRadius: 0,
        tension: 0.32,
      },
    ],
  };

  const todayDateKey = getDateKeyInColombo(currentTime);
  const occupancyBuckets = Array.from({ length: 24 }, (_, index) => ({
    hour: index,
    occupiedMinutes: 0,
    wasteMinutes: 0,
  }));

  hourlyAnalytics.forEach((row) => {
    if (!row?.hour) {
      return;
    }

    const [datePart, timePart] = String(row.hour).split(" ");

    if (datePart !== todayDateKey || !timePart) {
      return;
    }

    const hour = Number(timePart.slice(0, 2));

    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      return;
    }

    occupancyBuckets[hour].occupiedMinutes = Number(row.occupiedMinutes || 0);
    occupancyBuckets[hour].wasteMinutes = Number(row.totalWasteMinutes || 0);
  });

  const motionByHourChart = {
    labels: occupancyBuckets.map((bucket) => formatHourLabel(bucket.hour)),
    datasets: [
      {
        label: "Occupied time (min)",
        data: occupancyBuckets.map((bucket) => bucket.occupiedMinutes),
        backgroundColor: "rgba(52, 211, 153, 0.52)",
        borderRadius: 8,
      },
      {
        label: "Waste time (min)",
        data: occupancyBuckets.map((bucket) => bucket.wasteMinutes),
        backgroundColor: "rgba(255, 122, 122, 0.58)",
        borderRadius: 8,
      },
    ],
  };

  const powerSignalChart = {
    labels: recentReadings.map((reading) => formatShortTime(reading.timestamp)),
    datasets: [
      {
        label: "Fan signal",
        data: recentReadings.map((reading) => reading.fanRmsAboveBaseline || 0),
        borderColor: "#66a3ff",
        backgroundColor: "rgba(102, 163, 255, 0.1)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.28,
        fill: false,
      },
    ],
  };

  const powerStateBreakdownChart = {
    labels: ["Fan", "Lamp"],
    datasets: [
      {
        label: "ON time",
        data: [
          todayAnalytics?.fanRuntimeMinutes || 0,
          todayAnalytics?.lampRuntimeMinutes || 0,
        ],
        backgroundColor: ["rgba(102, 163, 255, 0.58)", "rgba(245, 192, 66, 0.62)"],
        borderColor: ["#66a3ff", "#f5c042"],
        borderWidth: 1,
        borderRadius: 8,
        categoryPercentage: 0.62,
        barPercentage: 0.9,
      },
      {
        label: "Waste time",
        data: [
          todayAnalytics?.fanWasteMinutes || 0,
          todayAnalytics?.lightWasteMinutes || 0,
        ],
        backgroundColor: ["rgba(255, 122, 122, 0.68)", "rgba(255, 122, 122, 0.68)"],
        borderColor: ["#ff7a7a", "#ff7a7a"],
        borderWidth: 1,
        borderRadius: 8,
        categoryPercentage: 0.62,
        barPercentage: 0.9,
      },
    ],
  };

  const powerUsageBuckets = Array.from({ length: 24 }, (_, index) => ({
    hour: index,
    fanRuntimeMinutes: 0,
    lampRuntimeMinutes: 0,
  }));

  hourlyAnalytics.forEach((row) => {
    if (!row?.hour) {
      return;
    }

    const [datePart, timePart] = String(row.hour).split(" ");

    if (datePart !== todayDateKey || !timePart) {
      return;
    }

    const hour = Number(timePart.slice(0, 2));

    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      return;
    }

    powerUsageBuckets[hour].fanRuntimeMinutes = Number(row.fanRuntimeMinutes || 0);
    powerUsageBuckets[hour].lampRuntimeMinutes = Number(row.lampRuntimeMinutes || 0);
  });

  const powerUsageByHourChart = {
    labels: powerUsageBuckets.map((bucket) => formatHourLabel(bucket.hour)),
    datasets: [
      {
        label: "Fan ON time",
        data: powerUsageBuckets.map((bucket) => bucket.fanRuntimeMinutes),
        backgroundColor: "rgba(102, 163, 255, 0.58)",
        borderColor: "#66a3ff",
        borderWidth: 1,
        borderRadius: 8,
      },
      {
        label: "Lamp ON time",
        data: powerUsageBuckets.map((bucket) => bucket.lampRuntimeMinutes),
        backgroundColor: "rgba(245, 192, 66, 0.62)",
        borderColor: "#f5c042",
        borderWidth: 1,
        borderRadius: 8,
      },
    ],
  };

  const topRecommendations = Array.from(
    new Set(
      (mlResult?.recommendations?.length
        ? mlResult.recommendations
        : todayAnalytics?.recommendations || []
      )
        .map((recommendation) => toFriendlyRecommendation(recommendation))
        .filter(Boolean)
    )
  ).slice(0, 4);

  const helpfulTips = buildContextualRecommendations({
    liveStatus,
    todayAnalytics,
    mlResult,
    nowValue: currentTime,
    limit: 4,
  });

  const currentViewMeta = VIEW_META[activeView];
  const CurrentViewIcon = currentViewMeta.icon;

  let topAlert = {
    tone: "healthy",
    title: "Realtime monitoring is stable.",
    detail:
      "Live polling is focused on room status while heavier analytics refresh more slowly to protect load times.",
  };

  if (liveStatus?.fanWaste) {
    topAlert = {
      tone: "critical",
      title: "Fan is running while the room is vacant.",
      detail: `No motion for ${formatSeconds(liveStatus.noMotionSeconds)}. Current live signal still shows fan activity.`,
    };
  } else if (liveStatus?.lightWaste) {
    topAlert = {
      tone: "warning",
      title: "Lighting waste is active during vacancy.",
      detail: `Lamp is ON while the room remains vacant for ${formatSeconds(liveStatus.noMotionSeconds)}.`,
    };
  } else if (
    activeView === "forecast" &&
    mlResult?.nextHourWastePrediction?.forecast?.riskLevel === "High"
  ) {
    topAlert = {
      tone: "accent",
      title: "High next-hour waste risk predicted by the latest ML run.",
      detail: `Forecasted waste: ${mlResult.nextHourWastePrediction.forecast.predictedNextHourWasteMinutes} minutes.`,
    };
  }

  const viewProps = {
    overview: {
      activeEvents,
      dailyPerformanceChart,
      overviewTimelineWindows,
      liveStatus,
      tempHumidityChart,
      todayAnalytics,
      helpfulTips,
      totalMonitoredMinutes,
      wasteBreakdownChart,
    },
    waste: {
      activeEvents,
      todayAnalytics,
      wasteEvents,
      ruleCards: RULE_CARDS,
    },
    forecast: {
      forecastComparisonChart,
      mlResult,
      nextHourWasteChart,
      topRecommendations,
    },
    environment: {
      liveStatus,
      motionByHourChart,
      recentReadings,
      tempHumidityChart,
      timelineReadings,
      todayAnalytics,
      totalMonitoredMinutes,
    },
    power: {
      liveStatus,
      powerSignalChart,
      powerStateBreakdownChart,
      powerUsageByHourChart,
      todayAnalytics,
    },
  };

  if (!bootstrapped) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <p className="loading-eyebrow">IoTHabit console</p>
          <h1>Preparing the monitoring workspace...</h1>
          <span>Loading live status and the overview panels.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          type="button"
          className="brand-card"
          onClick={() => setActiveView("overview")}
          aria-label="Go to overview"
        >
          <div className="brand-mark">
            <Zap size={16} />
          </div>
          <div>
            <h1>Habit Detector</h1>
          </div>
        </button>

        <div className="room-card">
          <p>Monitoring</p>
          <h2>Bedroom - Computer Table</h2>
          <div className="room-meta">
            <StatusPill tone="healthy" subtle>
              Live every {LIVE_REFRESH_MS / 1000}s
            </StatusPill>
          </div>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="nav-group">
            <p className="nav-group-label">{group.label}</p>
            <div className="nav-list">
              {group.items.map((item) => {
                const meta = VIEW_META[item];
                return (
                  <NavButton
                    key={item}
                    active={activeView === item}
                    onClick={() => setActiveView(item)}
                    label={meta.label}
                    Icon={meta.icon}
                    badge={item === "waste" ? activeEvents.length || null : null}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div className="workspace-heading">
            <p>{currentViewMeta.eyebrow}</p>
            <div className="title-row">
              <CurrentViewIcon size={18} />
              <h2>{currentViewMeta.title}</h2>
            </div>
            {activeView !== "overview" && currentViewMeta.subtitle ? (
              <span>{currentViewMeta.subtitle}</span>
            ) : null}
          </div>

          <div className="workspace-status">
            <StatusPill tone="healthy">Live</StatusPill>
            <div className="workspace-clock-group">
              {activeView === "forecast" ? (
                <div className="workspace-clock">
                  <Clock3 size={14} />
                  <div className="workspace-clock-copy">
                    <small>Last forecast update</small>
                    <span>{formatTimeAgo(mlResult?.generatedAt, currentTime)}</span>
                  </div>
                </div>
              ) : null}
              <div className="workspace-clock">
                <Clock3 size={14} />
                <div className="workspace-clock-copy">
                  <small>Last sensor update</small>
                  <span>{formatTimeAgo(liveStatus?.updatedAt, currentTime)}</span>
                </div>
              </div>
              <div className="workspace-clock">
                <Clock3 size={14} />
                <div className="workspace-clock-copy">
                  <small>Current time (Colombo)</small>
                  <span>{formatDateTime(currentTime)}</span>
                </div>
              </div>  
            </div>
          </div>
        </header>

        {activeView !== "overview" &&
        activeView !== "waste" &&
        activeView !== "forecast" &&
        activeView !== "environment" &&
        activeView !== "power" ? (
          <section className={`hero-alert tone-${topAlert.tone}`}>
            <div className="hero-alert-icon">
              <AlertTriangle size={16} />
            </div>
            <div className="hero-alert-copy">
              <strong>{topAlert.title}</strong>
              <span>{topAlert.detail}</span>
            </div>
          </section>
        ) : null}

        {loadError ? (
          <section className="inline-error">
            <AlertTriangle size={14} />
            <span>{loadError}</span>
          </section>
        ) : null}

        <div
          className="workspace-content"
          aria-busy={loadingViews[activeView] ? "true" : "false"}
        >
          <ActiveViewRenderer activeView={activeView} viewProps={viewProps} />
        </div>
      </main>
    </div>
  );
}

export default App;
