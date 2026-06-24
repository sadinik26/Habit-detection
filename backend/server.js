const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const { spawn } = require("child_process");
require("dotenv").config();

const Reading = require("./models/Reading");
const LatestStatus = require("./models/LatestStatus");
const WasteEvent = require("./models/WasteEvent");
const MLResult = require("./models/MLResult");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);
app.use(express.json({ limit: "100kb" }));

const PORT = process.env.PORT || 5000;

const SAMPLE_INTERVAL_SECONDS = Number(process.env.SAMPLE_INTERVAL_SECONDS || 30);
const FAN_WATTS = Number(process.env.FAN_WATTS || 35);
const LAMP_WATTS = Number(process.env.LAMP_WATTS || 8);
const ELECTRICITY_RATE_LKR = Number(process.env.ELECTRICITY_RATE_LKR || 60);
const ENABLE_ML_SCHEDULER =
  String(process.env.ENABLE_ML_SCHEDULER || "false").toLowerCase() === "true";
const ML_RUN_INTERVAL_MS = Math.max(
  60 * 1000,
  Number(process.env.ML_RUN_INTERVAL_MS || 5 * 60 * 1000)
);
const PYTHON_BIN = process.env.PYTHON_BIN || "python";
const ML_SCRIPT_PATH = path.resolve(__dirname, "..", "ml", "mlanalysis.py");
const ML_SCRIPT_DIR = path.dirname(ML_SCRIPT_PATH);

let mlRunInProgress = false;
let mlSchedulerHandle = null;

// =====================
// MongoDB Connection
// =====================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
    startMlScheduler();
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });

// =====================
// Helper Functions
// =====================
function roundNumber(value, decimals = 2) {
  return Number(Number(value || 0).toFixed(decimals));
}

function getStartOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function calculateHabitScore({
  fanOnCount = 0,
  lampOnCount = 0,
  fanWasteCount = 0,
  lightWasteCount = 0,
}) {
  const activeApplianceCount = fanOnCount + lampOnCount;
  const wasteApplianceCount = fanWasteCount + lightWasteCount;

  if (activeApplianceCount === 0) {
    return 100;
  }

  const wasteRatio = wasteApplianceCount / activeApplianceCount;
  const score = 100 - wasteRatio * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildRecommendations({ fanWasteMinutes, lightWasteMinutes, habitScore }) {
  const recommendations = [];

  if (fanWasteMinutes > 0) {
    recommendations.push(
      "Fan waste was detected. Switch off the fan when leaving the desk area."
    );
  }

  if (lightWasteMinutes > 0) {
    recommendations.push(
      "Lighting waste was detected. Switch off the lamp when the desk is not occupied."
    );
  }

  if (habitScore >= 85) {
    recommendations.push(
      "Energy habit score is strong. Continue maintaining this usage pattern."
    );
  } else if (habitScore >= 60) {
    recommendations.push(
      "Energy habit score is moderate. Reduce unoccupied fan or lamp usage."
    );
  } else {
    recommendations.push(
      "Energy habit score is low. Frequent waste events need attention."
    );
  }

  return recommendations;
}

function runMlAnalysis(trigger = "scheduler") {
  if (mlRunInProgress) {
    console.log(`[ML Scheduler] Skipping ${trigger} run because a previous run is still in progress.`);
    return;
  }

  mlRunInProgress = true;
  const startedAt = new Date();
  let stdoutBuffer = "";
  let stderrBuffer = "";

  console.log(
    `[ML Scheduler] Starting ${trigger} run at ${startedAt.toISOString()} using ${PYTHON_BIN}.`
  );

  const child = spawn(PYTHON_BIN, [ML_SCRIPT_PATH], {
    cwd: ML_SCRIPT_DIR,
    env: process.env,
    windowsHide: true,
  });

  child.stdout.on("data", (data) => {
    const output = data.toString();
    stdoutBuffer += output;
    process.stdout.write(`[ML Scheduler] ${output}`);
  });

  child.stderr.on("data", (data) => {
    const output = data.toString();
    stderrBuffer += output;
    process.stderr.write(`[ML Scheduler] ${output}`);
  });

  child.on("error", (error) => {
    mlRunInProgress = false;
    console.error(`[ML Scheduler] Failed to start Python process: ${error.message}`);
  });

  child.on("close", (code) => {
    mlRunInProgress = false;

    if (code === 0) {
      console.log(
        `[ML Scheduler] Run completed successfully at ${new Date().toISOString()}.`
      );
      return;
    }

    console.error(
      `[ML Scheduler] Run failed with exit code ${code}.` +
        (stderrBuffer ? ` Last error output: ${stderrBuffer.trim()}` : "")
    );
  });
}

function startMlScheduler() {
  if (!ENABLE_ML_SCHEDULER) {
    console.log("[ML Scheduler] Disabled. Set ENABLE_ML_SCHEDULER=true to enable.");
    return;
  }

  if (mlSchedulerHandle) {
    return;
  }

  console.log(
    `[ML Scheduler] Enabled. Running ${path.basename(
      ML_SCRIPT_PATH
    )} every ${Math.round(ML_RUN_INTERVAL_MS / 60000)} minutes.`
  );

  runMlAnalysis("startup");
  mlSchedulerHandle = setInterval(() => {
    runMlAnalysis("interval");
  }, ML_RUN_INTERVAL_MS);
}

async function updateWasteEvent({ roomId, type, isWaste, reason, payload }) {
  const activeEvent = await WasteEvent.findOne({
    roomId,
    type,
    status: "ACTIVE",
  });

  if (isWaste && !activeEvent) {
    await WasteEvent.create({
      roomId,
      type,
      status: "ACTIVE",
      startTime: new Date(),
      reason,
      startReading: payload,
    });

    return;
  }

  if (!isWaste && activeEvent) {
    const endTime = new Date();
    const durationSeconds = Math.round(
      (endTime.getTime() - activeEvent.startTime.getTime()) / 1000
    );

    activeEvent.status = "RESOLVED";
    activeEvent.endTime = endTime;
    activeEvent.durationSeconds = durationSeconds;
    activeEvent.endReading = payload;

    await activeEvent.save();
  }
}

// =====================
// Base Route
// =====================
app.get("/", (req, res) => {
  res.json({
    message: "Room Habit Energy Waste Detection API is running",
    status: "OK",
    database: mongoose.connection.readyState === 1 ? "connected" : "not_connected",
    config: {
      sampleIntervalSeconds: SAMPLE_INTERVAL_SECONDS,
      fanWatts: FAN_WATTS,
      lampWatts: LAMP_WATTS,
      electricityRateLKR: ELECTRICITY_RATE_LKR,
    },
  });
});

// =====================
// ESP32 Reading Route
// =====================
app.post("/api/readings", async (req, res) => {
  try {
    const payload = req.body;

    const roomId = payload.roomId || "desk_room_01";
    const deviceId = payload.deviceId || "esp32_01";
    const now = new Date();

    const readingData = {
      roomId,
      deviceId,
      timestamp: now,

      temperature: payload.temperature,
      humidity: payload.humidity,

      motionDetected: payload.motionDetected,
      noMotionSeconds: payload.noMotionSeconds,

      lampOn: payload.lampOn,
      fanOn: payload.fanOn,
      fanRmsAboveBaseline: payload.fanRmsAboveBaseline,

      fanWaste: payload.fanWaste,
      lightWaste: payload.lightWaste,
      roomStatus: payload.roomStatus,

      rawPayload: payload,
    };

    const savedReading = await Reading.create(readingData);

    await LatestStatus.findOneAndUpdate(
      { roomId },
      {
        roomId,
        deviceId,
        updatedAt: now,

        temperature: payload.temperature,
        humidity: payload.humidity,

        motionDetected: payload.motionDetected,
        noMotionSeconds: payload.noMotionSeconds,

        lampOn: payload.lampOn,
        fanOn: payload.fanOn,
        fanRmsAboveBaseline: payload.fanRmsAboveBaseline,

        fanWaste: payload.fanWaste,
        lightWaste: payload.lightWaste,
        roomStatus: payload.roomStatus,
      },
      { upsert: true, new: true }
    );

    await updateWasteEvent({
      roomId,
      type: "FAN_WASTE",
      isWaste: Boolean(payload.fanWaste),
      reason: "Fan was ON while no motion was detected for the configured threshold.",
      payload: readingData,
    });

    await updateWasteEvent({
      roomId,
      type: "LIGHT_WASTE",
      isWaste: Boolean(payload.lightWaste),
      reason: "Lamp was ON while no motion was detected for the configured threshold.",
      payload: readingData,
    });

    console.log("Saved reading:", {
      id: savedReading._id,
      roomId,
      fanWaste: payload.fanWaste,
      lightWaste: payload.lightWaste,
      roomStatus: payload.roomStatus,
    });

    res.status(201).json({
      message: "Reading stored successfully",
      readingId: savedReading._id,
    });
  } catch (error) {
    console.error("Error saving reading:", error.message);

    res.status(500).json({
      message: "Failed to store reading",
      error: error.message,
    });
  }
});

// =====================
// Live Status Route
// =====================
app.get("/api/live-status", async (req, res) => {
  try {
    const roomId = req.query.roomId || "desk_room_01";

    const status = await LatestStatus.findOne({ roomId }).lean();

    if (!status) {
      return res.status(404).json({
        message: "No live status found yet",
      });
    }

    res.json(status);
  } catch (error) {
    res.status(500).json({
      message: "Failed to get live status",
      error: error.message,
    });
  }
});

// =====================
// Recent Readings Route
// =====================
app.get("/api/readings/recent", async (req, res) => {
  try {
    const roomId = req.query.roomId || "desk_room_01";
    const limit = Math.min(Number(req.query.limit) || 100, 300);

    const readings = await Reading.find({ roomId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json(readings.reverse());
  } catch (error) {
    res.status(500).json({
      message: "Failed to get recent readings",
      error: error.message,
    });
  }
});

// =====================
// Waste Events Route
// =====================
app.get("/api/waste-events", async (req, res) => {
  try {
    const roomId = req.query.roomId || "desk_room_01";
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const events = await WasteEvent.find({ roomId })
      .sort({ startTime: -1 })
      .limit(limit)
      .lean();

    res.json(events);
  } catch (error) {
    res.status(500).json({
      message: "Failed to get waste events",
      error: error.message,
    });
  }
});

// =====================
// Today's Analytics Summary
// =====================
app.get("/api/analytics/today", async (req, res) => {
  try {
    const roomId = req.query.roomId || "desk_room_01";
    const startOfToday = getStartOfToday();

    const readings = await Reading.find({
      roomId,
      timestamp: { $gte: startOfToday },
    })
      .sort({ timestamp: 1 })
      .lean();

    const totalReadings = readings.length;

    const fanOnCount = readings.filter((r) => r.fanOn).length;
    const lampOnCount = readings.filter((r) => r.lampOn).length;
    const motionCount = readings.filter((r) => r.motionDetected).length;

    const fanWasteCount = readings.filter((r) => r.fanWaste).length;
    const lightWasteCount = readings.filter((r) => r.lightWaste).length;
    const wasteStateCount = readings.filter((r) => r.fanWaste || r.lightWaste).length;

    const fanRuntimeMinutes = (fanOnCount * SAMPLE_INTERVAL_SECONDS) / 60;
    const lampRuntimeMinutes = (lampOnCount * SAMPLE_INTERVAL_SECONDS) / 60;
    const occupiedMinutes = (motionCount * SAMPLE_INTERVAL_SECONDS) / 60;

    const fanWasteMinutes = (fanWasteCount * SAMPLE_INTERVAL_SECONDS) / 60;
    const lightWasteMinutes = (lightWasteCount * SAMPLE_INTERVAL_SECONDS) / 60;
    const totalWasteMinutes = (wasteStateCount * SAMPLE_INTERVAL_SECONDS) / 60;

    const fanWasteKWh =
      ((fanWasteCount * SAMPLE_INTERVAL_SECONDS) / 3600) * (FAN_WATTS / 1000);

    const lightWasteKWh =
      ((lightWasteCount * SAMPLE_INTERVAL_SECONDS) / 3600) * (LAMP_WATTS / 1000);

    const totalWasteKWh = fanWasteKWh + lightWasteKWh;
    const estimatedCostLKR = totalWasteKWh * ELECTRICITY_RATE_LKR;

    const avgTemperature =
      totalReadings > 0
        ? readings.reduce((sum, r) => sum + (r.temperature || 0), 0) / totalReadings
        : 0;

    const avgHumidity =
      totalReadings > 0
        ? readings.reduce((sum, r) => sum + (r.humidity || 0), 0) / totalReadings
        : 0;

    const habitScore = calculateHabitScore({
      fanOnCount,
      lampOnCount,
      fanWasteCount,
      lightWasteCount,
    });

    const recommendations = buildRecommendations({
      fanWasteMinutes,
      lightWasteMinutes,
      habitScore,
    });

    res.json({
      roomId,
      date: new Date().toISOString().slice(0, 10),
      sampleIntervalSeconds: SAMPLE_INTERVAL_SECONDS,

      totalReadings,

      fanRuntimeMinutes: roundNumber(fanRuntimeMinutes),
      lampRuntimeMinutes: roundNumber(lampRuntimeMinutes),
      occupiedMinutes: roundNumber(occupiedMinutes),

      fanWasteMinutes: roundNumber(fanWasteMinutes),
      lightWasteMinutes: roundNumber(lightWasteMinutes),
      totalWasteMinutes: roundNumber(totalWasteMinutes),

      fanWasteKWh: roundNumber(fanWasteKWh, 4),
      lightWasteKWh: roundNumber(lightWasteKWh, 4),
      totalWasteKWh: roundNumber(totalWasteKWh, 4),
      estimatedCostLKR: roundNumber(estimatedCostLKR, 2),

      avgTemperature: roundNumber(avgTemperature),
      avgHumidity: roundNumber(avgHumidity),

      habitScore,
      recommendations,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to generate today's analytics summary",
      error: error.message,
    });
  }
});

// =====================
// Hourly Analytics
// =====================
app.get("/api/analytics/hourly", async (req, res) => {
  try {
    const roomId = req.query.roomId || "desk_room_01";
    const hours = Math.min(Number(req.query.hours) || 24, 72);

    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const rows = await Reading.aggregate([
      {
        $match: {
          roomId,
          timestamp: { $gte: startTime },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d %H:00",
              date: "$timestamp",
              timezone: "Asia/Colombo",
            },
          },
          totalReadings: { $sum: 1 },
          fanOnCount: { $sum: { $cond: ["$fanOn", 1, 0] } },
          lampOnCount: { $sum: { $cond: ["$lampOn", 1, 0] } },
          motionCount: { $sum: { $cond: ["$motionDetected", 1, 0] } },
          fanWasteCount: { $sum: { $cond: ["$fanWaste", 1, 0] } },
          lightWasteCount: { $sum: { $cond: ["$lightWaste", 1, 0] } },
          avgTemperature: { $avg: "$temperature" },
          avgHumidity: { $avg: "$humidity" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const result = rows.map((row) => {
      const habitScore = calculateHabitScore({
        fanOnCount: row.fanOnCount,
        lampOnCount: row.lampOnCount,
        fanWasteCount: row.fanWasteCount,
        lightWasteCount: row.lightWasteCount,
      });

      return {
        hour: row._id,
        totalReadings: row.totalReadings,

        fanRuntimeMinutes: roundNumber((row.fanOnCount * SAMPLE_INTERVAL_SECONDS) / 60),
        lampRuntimeMinutes: roundNumber((row.lampOnCount * SAMPLE_INTERVAL_SECONDS) / 60),
        occupiedMinutes: roundNumber((row.motionCount * SAMPLE_INTERVAL_SECONDS) / 60),

        fanWasteMinutes: roundNumber((row.fanWasteCount * SAMPLE_INTERVAL_SECONDS) / 60),
        lightWasteMinutes: roundNumber((row.lightWasteCount * SAMPLE_INTERVAL_SECONDS) / 60),
        totalWasteMinutes: roundNumber(
          ((row.fanWasteCount + row.lightWasteCount) * SAMPLE_INTERVAL_SECONDS) / 60
        ),

        avgTemperature: roundNumber(row.avgTemperature),
        avgHumidity: roundNumber(row.avgHumidity),

        habitScore,
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to generate hourly analytics",
      error: error.message,
    });
  }
});

// =====================
// Daily Analytics
// =====================
app.get("/api/analytics/daily", async (req, res) => {
  try {
    const roomId = req.query.roomId || "desk_room_01";
    const days = Math.min(Number(req.query.days) || 7, 14);

    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await Reading.aggregate([
      {
        $match: {
          roomId,
          timestamp: { $gte: startTime },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$timestamp",
              timezone: "Asia/Colombo",
            },
          },
          totalReadings: { $sum: 1 },
          fanOnCount: { $sum: { $cond: ["$fanOn", 1, 0] } },
          lampOnCount: { $sum: { $cond: ["$lampOn", 1, 0] } },
          motionCount: { $sum: { $cond: ["$motionDetected", 1, 0] } },
          fanWasteCount: { $sum: { $cond: ["$fanWaste", 1, 0] } },
          lightWasteCount: { $sum: { $cond: ["$lightWaste", 1, 0] } },
          avgTemperature: { $avg: "$temperature" },
          avgHumidity: { $avg: "$humidity" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const result = rows.map((row) => {
      const habitScore = calculateHabitScore({
        fanOnCount: row.fanOnCount,
        lampOnCount: row.lampOnCount,
        fanWasteCount: row.fanWasteCount,
        lightWasteCount: row.lightWasteCount,
      });

      const fanWasteKWh =
        ((row.fanWasteCount * SAMPLE_INTERVAL_SECONDS) / 3600) * (FAN_WATTS / 1000);

      const lightWasteKWh =
        ((row.lightWasteCount * SAMPLE_INTERVAL_SECONDS) / 3600) * (LAMP_WATTS / 1000);

      const totalWasteKWh = fanWasteKWh + lightWasteKWh;

      return {
        date: row._id,
        totalReadings: row.totalReadings,

        fanRuntimeMinutes: roundNumber((row.fanOnCount * SAMPLE_INTERVAL_SECONDS) / 60),
        lampRuntimeMinutes: roundNumber((row.lampOnCount * SAMPLE_INTERVAL_SECONDS) / 60),
        occupiedMinutes: roundNumber((row.motionCount * SAMPLE_INTERVAL_SECONDS) / 60),

        fanWasteMinutes: roundNumber((row.fanWasteCount * SAMPLE_INTERVAL_SECONDS) / 60),
        lightWasteMinutes: roundNumber((row.lightWasteCount * SAMPLE_INTERVAL_SECONDS) / 60),
        totalWasteMinutes: roundNumber(
          ((row.fanWasteCount + row.lightWasteCount) * SAMPLE_INTERVAL_SECONDS) / 60
        ),

        totalWasteKWh: roundNumber(totalWasteKWh, 4),
        estimatedCostLKR: roundNumber(totalWasteKWh * ELECTRICITY_RATE_LKR, 2),

        avgTemperature: roundNumber(row.avgTemperature),
        avgHumidity: roundNumber(row.avgHumidity),

        habitScore,
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to generate daily analytics",
      error: error.message,
    });
  }
});

app.get("/api/ml/latest", async (req, res) => {
  try {
    const roomId = req.query.roomId || "desk_room_01";

    const result = await MLResult.findOne({ roomId })
      .sort({ generatedAt: -1 })
      .lean();

    if (!result) {
      return res.status(404).json({
        message: "No ML results found yet. Run the Python ML script first.",
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to get latest ML result",
      error: error.message,
    });
  }
});

// =====================
// Start Server
// =====================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
