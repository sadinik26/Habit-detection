import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

function formatAxisDecimal(value, suffix = "") {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return `--${suffix}`;
  }

  return `${numericValue.toFixed(1)}${suffix}`;
}

export const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: "index",
    intersect: false,
  },
  plugins: {
    legend: {
      position: "top",
      align: "end",
      labels: {
        color: "#c8d0e0",
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        pointStyle: "circle",
        font: {
          family: "Space Grotesk, Segoe UI, sans-serif",
          size: 11,
          weight: 500,
        },
      },
    },
    tooltip: {
      backgroundColor: "rgba(9, 12, 20, 0.96)",
      titleColor: "#f5f7ff",
      bodyColor: "#d9e0ef",
      borderColor: "rgba(116, 132, 168, 0.24)",
      borderWidth: 1,
      padding: 12,
      displayColors: true,
    },
  },
  scales: {
    x: {
      ticks: {
        color: "#6f7896",
        maxRotation: 0,
        font: {
          family: "Space Grotesk, Segoe UI, sans-serif",
          size: 11,
        },
      },
      grid: {
        color: "rgba(96, 108, 140, 0.12)",
        drawBorder: false,
      },
    },
    y: {
      ticks: {
        color: "#6f7896",
        font: {
          family: "Space Grotesk, Segoe UI, sans-serif",
          size: 11,
        },
      },
      grid: {
        color: "rgba(96, 108, 140, 0.12)",
        drawBorder: false,
      },
    },
  },
};

export const dualAxisChartOptions = {
  ...baseChartOptions,
  scales: {
    x: baseChartOptions.scales.x,
    y: {
      ...baseChartOptions.scales.y,
      position: "left",
    },
    y1: {
      ...baseChartOptions.scales.y,
      position: "right",
      grid: {
        drawOnChartArea: false,
      },
      min: 0,
      max: 100,
    },
  },
};

export const stackedBarChartOptions = {
  ...baseChartOptions,
  scales: {
    x: {
      ...baseChartOptions.scales.x,
      stacked: true,
    },
    y: {
      ...baseChartOptions.scales.y,
      stacked: true,
      beginAtZero: true,
    },
  },
};

export const tempHumidityChartOptions = {
  ...baseChartOptions,
  scales: {
    x: baseChartOptions.scales.x,
    temperature: {
      ...baseChartOptions.scales.y,
      position: "left",
      ticks: {
        ...baseChartOptions.scales.y.ticks,
        color: "#ff7a7a",
        callback: (value) => formatAxisDecimal(value, "°C"),
      },
      grid: {
        ...baseChartOptions.scales.y.grid,
      },
    },
    humidity: {
      ...baseChartOptions.scales.y,
      position: "right",
      ticks: {
        ...baseChartOptions.scales.y.ticks,
        color: "#5aa7ff",
        callback: (value) => formatAxisDecimal(value, "%"),
      },
      grid: {
        drawOnChartArea: false,
      },
    },
  },
};

export const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "68%",
  plugins: baseChartOptions.plugins,
};
