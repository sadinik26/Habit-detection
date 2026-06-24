const mongoose = require("mongoose");

const latestStatusSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    deviceId: String,

    updatedAt: { type: Date, default: Date.now },

    temperature: Number,
    humidity: Number,

    motionDetected: Boolean,
    noMotionSeconds: Number,

    lampOn: Boolean,
    fanOn: Boolean,
    fanRmsAboveBaseline: Number,

    fanWaste: Boolean,
    lightWaste: Boolean,
    roomStatus: String,
  },
  { collection: "latest_status" }
);

module.exports = mongoose.model("LatestStatus", latestStatusSchema);