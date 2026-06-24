const mongoose = require("mongoose");

const wasteEventSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["FAN_WASTE", "LIGHT_WASTE"],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "RESOLVED"],
      default: "ACTIVE",
      index: true,
    },

    startTime: { type: Date, default: Date.now, index: true },
    endTime: Date,
    durationSeconds: Number,

    reason: String,

    startReading: Object,
    endReading: Object,
  },
  { collection: "waste_events" }
);

module.exports = mongoose.model("WasteEvent", wasteEventSchema);