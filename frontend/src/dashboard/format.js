const COLOMBO_TIME_ZONE = "Asia/Colombo";

export function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  return Number(value).toFixed(decimals);
}

export function formatShortTime(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleTimeString([], {
    timeZone: COLOMBO_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString([], {
    timeZone: COLOMBO_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRecommendationHour(hourValue) {
  if (!Number.isFinite(hourValue)) {
    return null;
  }

  const normalizedHour = ((hourValue % 24) + 24) % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const hour12 = normalizedHour % 12 || 12;
  return `${hour12} ${suffix}`;
}

const FRIENDLY_FEATURE_LABELS = {
  hour: "Time of day",
  dayOfWeek: "Day of week",
  temperature: "Room temperature",
  humidity: "Room humidity",
  rawMotionDetected: "Instant motion reading",
  motionDetected: "Table occupancy",
  noMotionSeconds: "How long the table was empty",
  occupancyHoldRemainingSeconds: "Occupancy hold time",
  previousFanRms: "Recent fan use",
  previousUsageScore: "Recent device activity",
  lampOn: "Lamp already on",
  fanOn: "Fan already on",
  fanRmsAboveBaseline: "Fan current level",
  usageScore: "Overall device activity",
};

function addRecommendation(candidates, text, priority) {
  if (!text) {
    return;
  }

  candidates.push({ text, priority });
}

function uniqueRecommendations(candidates, limit) {
  const seen = new Set();

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .map((item) => item.text.trim())
    .filter((text) => {
      if (!text) {
        return false;
      }

      const key = text.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function joinLabels(labels) {
  if (labels.length <= 1) {
    return labels[0] || "";
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function isMlInsightFresh(mlResult, nowValue = new Date()) {
  if (!mlResult?.generatedAt) {
    return false;
  }

  const generatedAt = new Date(mlResult.generatedAt).getTime();
  const reference = new Date(nowValue).getTime();

  if (Number.isNaN(generatedAt) || Number.isNaN(reference)) {
    return false;
  }

  return Math.abs(reference - generatedAt) <= 24 * 60 * 60 * 1000;
}

export function formatTimeAgo(value, nowValue = new Date()) {
  if (!value) {
    return "--";
  }

  const timestamp = new Date(value).getTime();
  const reference = new Date(nowValue).getTime();

  if (Number.isNaN(timestamp) || Number.isNaN(reference)) {
    return "--";
  }

  const diffSeconds = Math.max(0, Math.floor((reference - timestamp) / 1000));

  if (diffSeconds < 60) {
    return `${diffSeconds} second${diffSeconds === 1 ? "" : "s"} ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) {
    return "more than 30 days ago";
  }

  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function toFriendlyRecommendation(text) {
  if (!text) {
    return "";
  }

  const normalized = text.toLowerCase();
  const hourMatch = text.match(/(\d{1,2}):00/);
  const hourLabel = hourMatch
    ? formatRecommendationHour(Number(hourMatch[1]))
    : null;

  if (normalized.includes("fan waste was detected")) {
    return "Try turning off the fan when you leave the computer table.";
  }

  if (normalized.includes("lighting waste was detected")) {
    return "Try turning off the lamp when the table is not being used.";
  }

  if (normalized.includes("energy habit score is strong")) {
    return "Good job. You are already using the fan and lamp carefully.";
  }

  if (normalized.includes("energy habit score is moderate")) {
    return "You could save a bit more power by switching off the fan or lamp when you step away.";
  }

  if (normalized.includes("energy habit score is low")) {
    return "A lot of power is being wasted. Try turning off the fan and lamp whenever the table is empty.";
  }

  if (normalized.includes("k-means identified")) {
    return hourLabel
      ? `This room often wastes power around ${hourLabel}. It would be worth checking the fan and lamp around then.`
      : "This room has a repeated waste period. It would be worth checking the fan and lamp during those times.";
  }

  if (normalized.includes("higher than the model expected")) {
    return "The fan seems to be using more power than usual right now. Check whether it still needs to be on.";
  }

  if (normalized.includes("current fan usage is close to the expected pattern")) {
    return "The fan use looks normal right now.";
  }

  if (normalized.includes("high waste risk")) {
    return "There is a high chance of wasted power in the next hour. A quick check of the fan and lamp would help.";
  }

  if (normalized.includes("moderate waste risk")) {
    return "There may be some wasted power in the next hour. A quick check of the fan and lamp would help.";
  }

  if (normalized.includes("peak historical waste was observed around")) {
    return hourLabel
      ? `Most waste usually happens around ${hourLabel}. Pay extra attention to the fan and lamp at that time.`
      : "There is a time of day when waste happens more often. Pay extra attention to the fan and lamp then.";
  }

  if (normalized.includes("daily waste appears to be increasing")) {
    return "Power waste has been going up lately. Try switching things off as soon as you leave.";
  }

  if (normalized.includes("daily waste appears to be reducing")) {
    return "Good progress. Power waste has been going down.";
  }

  if (normalized.includes("strongest non-circular relationship with waste")) {
    return "Some room conditions seem to lead to more waste. Keep an eye on the fan and lamp when the table is empty.";
  }

  if (normalized.includes("continue collecting data")) {
    return "Keep the system running and the tips will get better over time.";
  }

  return "Check the fan and lamp and switch them off when they are not needed.";
}

export function getFriendlyFeatureLabel(feature) {
  return FRIENDLY_FEATURE_LABELS[feature] || feature;
}

export function getFeatureSupportText(feature) {
  return `ML feature: ${feature}`;
}

export function getCorrelationExplanation(feature, correlationValue) {
  const label = getFriendlyFeatureLabel(feature);

  if (feature === "motionDetected") {
    return correlationValue < 0
      ? "Waste usually drops when someone is at the table."
      : "Waste tends to rise when motion is present.";
  }

  if (feature === "noMotionSeconds") {
    return correlationValue > 0
      ? "Longer empty-table periods are linked to more waste."
      : "Shorter empty-table periods are linked to less waste.";
  }

  if (feature === "hour" || feature === "dayOfWeek") {
    return "Waste tends to change depending on the time pattern.";
  }

  if (feature === "lampOn" || feature === "fanOn") {
    return correlationValue > 0
      ? `${label} is linked to higher waste.`
      : `${label} is linked to lower waste.`;
  }

  if (feature === "temperature" || feature === "humidity") {
    return `${label} appears to influence when waste is more likely.`;
  }

  return correlationValue > 0
    ? `${label} is linked to higher waste.`
    : `${label} is linked to lower waste.`;
}

function pushGroupedAction(groupMap, key, text, priority) {
  if (!text) {
    return;
  }

  groupMap[key].push({ text, priority });
}

function finalizeGroupedActions(items, limitPerGroup) {
  const seen = new Set();

  return items
    .sort((a, b) => b.priority - a.priority)
    .map((item) => item.text.trim())
    .filter((text) => {
      if (!text) {
        return false;
      }

      const key = text.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, limitPerGroup);
}

function groupFallbackRecommendation(text) {
  const normalized = text.toLowerCase();

  if (
    normalized.includes("next hour") ||
    normalized.includes("right now") ||
    normalized.includes("quick check") ||
    normalized.includes("turning off")
  ) {
    return "doNow";
  }

  if (
    normalized.includes("around ") ||
    normalized.includes("at that time") ||
    normalized.includes("most waste usually happens")
  ) {
    return "highRiskTime";
  }

  return "watchLater";
}

export function buildForecastActionGroups({
  mlResult,
  recommendations = [],
  limitPerGroup = 2,
}) {
  const grouped = {
    doNow: [],
    watchLater: [],
    highRiskTime: [],
  };

  const latestComparison = mlResult?.expectedFanUsagePrediction?.latestComparison;
  const latestForecast = mlResult?.nextHourWastePrediction?.forecast;
  const peakHours = mlResult?.patternAnalysis?.peakWasteHours || [];
  const trendDirection = mlResult?.trendAnalysis?.trendDirection;

  if (latestComparison?.comparisonLevel === "higher_than_expected") {
    pushGroupedAction(
      grouped,
      "doNow",
      "The fan is using more power than usual right now. Check whether it still needs to be on.",
      100
    );
  }

  if (latestForecast?.riskLevel === "High") {
    pushGroupedAction(
      grouped,
      "doNow",
      `The next hour has a high waste risk. About ${latestForecast.predictedNextHourWasteMinutes} minutes of waste may happen if nothing changes.`,
      95
    );
  } else if (latestForecast?.riskLevel === "Medium") {
    pushGroupedAction(
      grouped,
      "doNow",
      `The next hour has some waste risk. About ${latestForecast.predictedNextHourWasteMinutes} minutes of waste may happen if nothing changes.`,
      85
    );
  }

  if (latestComparison?.comparisonLevel === "normal") {
    pushGroupedAction(
      grouped,
      "watchLater",
      "Current fan use looks normal for this time, so keep the same habit going.",
      60
    );
  }

  if (trendDirection === "increasing_waste") {
    pushGroupedAction(
      grouped,
      "watchLater",
      "Waste has been increasing over recent days. Try to be extra careful when leaving the table.",
      70
    );
  } else if (trendDirection === "decreasing_waste") {
    pushGroupedAction(
      grouped,
      "watchLater",
      "Waste has been improving recently. Keep following the same good habits.",
      55
    );
  }

  if (peakHours.length > 0) {
    const peakHourLabel = formatRecommendationHour(Number(peakHours[0]?.hour));

    pushGroupedAction(
      grouped,
      "highRiskTime",
      peakHourLabel
        ? `Waste usually happens most around ${peakHourLabel}. Pay extra attention to the fan and lamp then.`
        : "There is a usual time of day when waste happens more often. Pay extra attention then.",
      75
    );
  }

  recommendations.forEach((recommendation) => {
    pushGroupedAction(
      grouped,
      groupFallbackRecommendation(recommendation),
      recommendation,
      30
    );
  });

  const groups = [
    {
      title: "Do now",
      subtitle: "Things worth checking straight away",
      items: finalizeGroupedActions(grouped.doNow, limitPerGroup),
    },
    {
      title: "Watch later",
      subtitle: "What to keep an eye on next",
      items: finalizeGroupedActions(grouped.watchLater, limitPerGroup),
    },
    {
      title: "Usual high-risk time",
      subtitle: "When waste is most likely to happen",
      items: finalizeGroupedActions(grouped.highRiskTime, limitPerGroup),
    },
  ].filter((group) => group.items.length > 0);

  if (groups.length > 0) {
    return groups;
  }

  return [
    {
      title: "Suggested actions",
      subtitle: "Advice will appear here once the model has enough history",
      items: ["Keep the system running a little longer and suggestions will appear here."],
    },
  ];
}

export function buildContextualRecommendations({
  liveStatus,
  todayAnalytics,
  mlResult,
  nowValue = new Date(),
  limit = 4,
}) {
  const candidates = [];
  const noMotionSeconds = liveStatus?.noMotionSeconds || 0;
  const fanWasteMinutes = Number(todayAnalytics?.fanWasteMinutes || 0);
  const lightWasteMinutes = Number(todayAnalytics?.lightWasteMinutes || 0);
  const totalWasteMinutes = Number(todayAnalytics?.totalWasteMinutes || 0);
  const habitScore = Number(todayAnalytics?.habitScore ?? NaN);
  const totalReadings = Number(todayAnalytics?.totalReadings || 0);
  const mlFresh = isMlInsightFresh(mlResult, nowValue);

  if (liveStatus?.fanWaste) {
    addRecommendation(
      candidates,
      "The table is empty and the fan is still on. Turning it off now would reduce wasted power.",
      100
    );
  }

  if (liveStatus?.lightWaste) {
    addRecommendation(
      candidates,
      "The table is empty and the lamp is still on. Turning it off now would reduce wasted power.",
      100
    );
  }

  const unattendedDevices = [];

  if (liveStatus?.fanOn && !liveStatus?.fanWaste) {
    unattendedDevices.push("fan");
  }

  if (liveStatus?.lampOn && !liveStatus?.lightWaste) {
    unattendedDevices.push("lamp");
  }

  if (!liveStatus?.motionDetected && noMotionSeconds >= 60 && unattendedDevices.length > 0) {
    const devicesLabel = joinLabels(unattendedDevices);
    addRecommendation(
      candidates,
      `No one has been at the table for ${formatSeconds(noMotionSeconds)}. Check whether the ${devicesLabel} still need to be on.`,
      90
    );
  }

  if (fanWasteMinutes > 0 || lightWasteMinutes > 0) {
    if (fanWasteMinutes > lightWasteMinutes && fanWasteMinutes >= 2) {
      addRecommendation(
        candidates,
        "Most of today's wasted time came from the fan. Switching it off when you step away would help the most.",
        80
      );
    } else if (lightWasteMinutes > fanWasteMinutes && lightWasteMinutes >= 2) {
      addRecommendation(
        candidates,
        "Most of today's wasted time came from the lamp. Turning it off when the table is empty would help the most.",
        80
      );
    } else if (fanWasteMinutes > 0 && lightWasteMinutes > 0) {
      addRecommendation(
        candidates,
        "Both the fan and the lamp have been left on while the table was not being used. A quick check before leaving would help.",
        78
      );
    }

    if (totalWasteMinutes >= 10) {
      addRecommendation(
        candidates,
        `About ${formatDurationMinutes(totalWasteMinutes)} of waste has been recorded today. Checking the fan and lamp before leaving could reduce it.`,
        72
      );
    }
  } else if (totalReadings > 0) {
    addRecommendation(
      candidates,
      "No waste has been detected today. Keep using the fan and lamp this way.",
      55
    );
  }

  if (!Number.isNaN(habitScore)) {
    if (habitScore < 60) {
      addRecommendation(
        candidates,
        "Today's usage still has a lot of waste. Try switching things off as soon as the table is empty.",
        68
      );
    } else if (habitScore >= 85 && totalWasteMinutes === 0) {
      addRecommendation(
        candidates,
        "Good job. Today's usage has been careful and efficient so far.",
        50
      );
    }
  }

  if (mlFresh) {
    const forecast = mlResult?.nextHourWastePrediction?.forecast;
    const peakHours = mlResult?.patternAnalysis?.peakWasteHours || [];
    const trendDirection = mlResult?.trendAnalysis?.trendDirection;

    if (forecast?.riskLevel === "High") {
      addRecommendation(
        candidates,
        "There is a high chance of wasted power in the next hour. A quick check of the fan and lamp would help.",
        60
      );
    } else if (forecast?.riskLevel === "Medium") {
      addRecommendation(
        candidates,
        "There may be some wasted power in the next hour. A quick check of the fan and lamp would help.",
        56
      );
    }

    if (peakHours.length > 0) {
      const hourLabel = formatRecommendationHour(Number(peakHours[0]?.hour));

      addRecommendation(
        candidates,
        hourLabel
          ? `Most waste usually happens around ${hourLabel}. Pay extra attention to the fan and lamp at that time.`
          : "Waste usually happens more often at a certain time of day. Pay extra attention to the fan and lamp then.",
        52
      );
    }

    if (trendDirection === "increasing_waste") {
      addRecommendation(
        candidates,
        "Power waste has been going up lately. Try switching things off as soon as you leave.",
        48
      );
    } else if (trendDirection === "decreasing_waste") {
      addRecommendation(
        candidates,
        "Good progress. Power waste has been going down.",
        42
      );
    }
  }

  const fallbackRecommendations = mlFresh
    ? mlResult?.recommendations || todayAnalytics?.recommendations || []
    : todayAnalytics?.recommendations || [];

  fallbackRecommendations.forEach((recommendation) => {
    addRecommendation(candidates, toFriendlyRecommendation(recommendation), 30);
  });

  const finalRecommendations = uniqueRecommendations(candidates, limit);

  if (finalRecommendations.length > 0) {
    return finalRecommendations;
  }

  return ["Keep the system running and the tips will get better over time."];
}

export function getHourInColombo(value) {
  if (!value) {
    return 0;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: COLOMBO_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const hourPart = parts.find((part) => part.type === "hour");
  return hourPart ? Number(hourPart.value) : 0;
}

export function getDateKeyInColombo(value) {
  if (!value) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date(value));
}

export function formatHourLabel(hourValue) {
  const hour = Number(hourValue);

  if (!Number.isFinite(hour)) {
    return "--";
  }

  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized < 12 ? "am" : "pm";
  const hour12 = normalized % 12 || 12;

  return `${hour12}${suffix}`;
}

export function formatDurationMinutes(minutes) {
  if (!minutes || minutes <= 0) {
    return "0 min";
  }

  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours === 0) {
    return `${mins} min`;
  }

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Rs. --";
  }

  return `Rs. ${Number(value).toFixed(2)}`;
}

export function formatSeconds(seconds) {
  if (!seconds || seconds <= 0) {
    return "0s";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function toneForEvent(event) {
  if (!event) {
    return "muted";
  }

  if (event.status === "ACTIVE") {
    return "critical";
  }

  if (event.type === "LIGHT_WASTE") {
    return "warning";
  }

  return "healthy";
}
