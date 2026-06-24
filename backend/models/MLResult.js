const mongoose = require("mongoose");

const mlResultSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    analysisType: { type: String, default: "combined_ml_analysis" },
    generatedAt: { type: Date, default: Date.now, index: true },

    dataRange: {
      start: Date,
      end: Date,
      totalRecords: Number,
      totalHourlyProfiles: Number,
    },

    anomalyDetection: Object,

    usageClustering: Object,
    expectedFanUsagePrediction: Object,
    nextHourWastePrediction: Object,

    correlationAnalysis: Object,
    patternAnalysis: Object,
    trendAnalysis: Object,
    recommendations: [String],
  },
  { collection: "ml_results" }
);

module.exports = mongoose.model("MLResult", mlResultSchema);