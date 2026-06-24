const mongoose = require("mongoose");

const readingSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    deviceId: { type: String, required: true },

    timestamp: { type: Date, default: Date.now, index: true },

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

    rawPayload: Object,
  },
  { collection: "readings_raw" }
);

module.exports = mongoose.model("Reading", readingSchema);