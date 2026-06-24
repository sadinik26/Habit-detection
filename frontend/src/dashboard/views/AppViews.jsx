import { EnvironmentView } from "./EnvironmentView";
import { ForecastView } from "./ForecastView";
import { OverviewView } from "./OverviewView";
import { PowerView } from "./PowerView";
import { WasteView } from "./WasteView";

export function ActiveViewRenderer({ activeView, viewProps }) {
  if (activeView === "overview") {
    return <OverviewView {...viewProps.overview} />;
  }

  if (activeView === "waste") {
    return <WasteView {...viewProps.waste} />;
  }

  if (activeView === "forecast") {
    return <ForecastView {...viewProps.forecast} />;
  }

  if (activeView === "environment") {
    return <EnvironmentView {...viewProps.environment} />;
  }

  return <PowerView {...viewProps.power} />;
}
