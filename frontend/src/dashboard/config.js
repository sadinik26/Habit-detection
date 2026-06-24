import {
  AlertTriangle,
  BrainCircuit,
  LayoutDashboard,
  Waves,
  Zap,
} from "lucide-react";

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";
export const LIVE_REFRESH_MS = 30000;

export const VIEW_REFRESH_MS = {
  overview: 30000,
  waste: 45000,
  forecast: 60000,
  environment: 30000,
  power: 30000,
};

export const VIEW_META = {
  overview: {
    label: "Overview",
    eyebrow: "Live monitoring",
    title: "Room Overview",
    icon: LayoutDashboard,
  },
  waste: {
    label: "Waste Events",
    eyebrow: "Waste event log",
    title: "Detected Waste Events",
    icon: AlertTriangle,
  },
  forecast: {
    label: "Forecast",
    eyebrow: "Smart Usage Forecast",
    title: "Forecast Predictions and Pattern Signals",
    icon: BrainCircuit,
  },
  environment: {
    label: "Environment",
    eyebrow: "Sensor environment",
    title: "Temperature, Humidity, and Occupancy",
    icon: Waves,
  },
  power: {
    label: "Appliance Power",
    eyebrow: "Appliance runtime",
    title: "Power and Appliance Waste",
    icon: Zap,
  },
};

export const NAV_GROUPS = [
  {
    label: "Main",
    items: ["overview", "waste", "forecast"],
  },
  {
    label: "Sensors",
    items: ["environment", "power"],
  },
];

export const RULE_CARDS = [
  {
    title: "Rule 01 - Fan waste",
    detail: "Fan ON while the room is vacant for at least 5 minutes.",
    tone: "critical",
  },
  {
    title: "Rule 02 - Light waste",
    detail: "Lamp ON while the room is vacant for at least 5 minutes.",
    tone: "warning",
  },
  {
    title: "Rule 03 - Occupancy smoothing",
    detail: "Motion Detection is stabilized with a 2 minute occupancy hold.",
    tone: "healthy",
  },
];
