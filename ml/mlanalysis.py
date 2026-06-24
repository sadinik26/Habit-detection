import os
from datetime import datetime, timedelta, timezone

try:
    import numpy as np
    import pandas as pd
    from dotenv import load_dotenv
    from pymongo import MongoClient
    from sklearn.cluster import KMeans
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score, silhouette_score
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
except ModuleNotFoundError as exc:
    missing_package = getattr(exc, "name", "a required dependency")
    raise SystemExit(
        f"Missing Python dependency: {missing_package}. "
        "Install the ML requirements with `python -m pip install -r ml/requirements.txt`."
    ) from exc


ROOM_ID = "desk_room_01"
DAYS_BACK = 7
SAMPLE_INTERVAL_SECONDS = 30
LOCAL_TIMEZONE = "Asia/Colombo"
RANDOM_STATE = 42
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_mongo_uri():
    backend_env_path = os.path.join(BASE_DIR, "..", "backend", ".env")
    load_dotenv(backend_env_path)

    mongo_uri = os.getenv("MONGO_URI")

    if not mongo_uri:
        raise ValueError("MONGO_URI not found. Check backend/.env")

    return mongo_uri


def get_database_from_uri(client):
    db_name = os.getenv("MONGO_DB_NAME")

    if db_name:
        print(f"Using database from MONGO_DB_NAME: {db_name}")
        return client[db_name]

    try:
        db = client.get_default_database()
        print(f"Using default database from URI: {db.name}")
        return db
    except Exception:
        print("No default database found in MongoDB URI.")
        print("Trying to find database that contains readings_raw...")

    system_dbs = {"admin", "local", "config"}

    for name in client.list_database_names():
        if name in system_dbs:
            continue

        db = client[name]
        collections = db.list_collection_names()

        if "readings_raw" in collections:
            print(f"Found readings_raw in database: {name}")
            return db

    print("Could not auto-detect database. Falling back to database: test")
    return client["test"]


def load_readings(db):
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=DAYS_BACK)

    cursor = db["readings_raw"].find(
        {
            "roomId": ROOM_ID,
            "timestamp": {"$gte": start_time, "$lte": end_time},
        },
        {
            "_id": 0,
            "timestamp": 1,
            "temperature": 1,
            "humidity": 1,
            "rawMotionDetected": 1,
            "motionDetected": 1,
            "noMotionSeconds": 1,
            "occupancyHoldRemainingSeconds": 1,
            "lampOn": 1,
            "fanOn": 1,
            "fanRmsAboveBaseline": 1,
            "fanWaste": 1,
            "lightWaste": 1,
            "roomStatus": 1,
        },
    ).sort("timestamp", 1)

    df = pd.DataFrame(list(cursor))
    return df, start_time, end_time


def to_local_timestamp(series):
    ts = pd.to_datetime(series, errors="coerce")

    if ts.dt.tz is None:
        ts = ts.dt.tz_localize("UTC")

    return ts.dt.tz_convert(LOCAL_TIMEZONE)


def prepare_features(df):
    df = df.copy()

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)
    df["localTimestamp"] = to_local_timestamp(df["timestamp"])
    df["hour"] = df["localTimestamp"].dt.hour
    df["dayOfWeek"] = df["localTimestamp"].dt.dayofweek

    bool_columns = [
        "rawMotionDetected",
        "motionDetected",
        "lampOn",
        "fanOn",
        "fanWaste",
        "lightWaste",
    ]

    for col in bool_columns:
        if col not in df.columns:
            df[col] = False
        df[col] = df[col].fillna(False).astype(int)

    numeric_columns = [
        "temperature",
        "humidity",
        "noMotionSeconds",
        "occupancyHoldRemainingSeconds",
        "fanRmsAboveBaseline",
    ]

    for col in numeric_columns:
        if col not in df.columns:
            df[col] = 0
        df[col] = pd.to_numeric(df[col], errors="coerce")
        median_value = df[col].median() if df[col].notna().any() else 0
        df[col] = df[col].fillna(median_value)

    df["anyWaste"] = ((df["fanWaste"] == 1) | (df["lightWaste"] == 1)).astype(int)
    df["usageScore"] = df["fanOn"] + df["lampOn"]
    df["previousFanRms"] = df["fanRmsAboveBaseline"].shift(1).fillna(0)
    df["previousUsageScore"] = df["usageScore"].shift(1).fillna(0)

    return df


def build_hourly_profiles(df):
    df = df.copy()
    df["hourStart"] = df["localTimestamp"].dt.floor("h")

    hourly = (
        df.groupby("hourStart")
        .agg(
            totalReadings=("timestamp", "count"),
            hour=("hour", "first"),
            dayOfWeek=("dayOfWeek", "first"),
            occupancyRate=("motionDetected", "mean"),
            fanOnRate=("fanOn", "mean"),
            lampOnRate=("lampOn", "mean"),
            avgNoMotionSeconds=("noMotionSeconds", "mean"),
            avgTemperature=("temperature", "mean"),
            avgHumidity=("humidity", "mean"),
            avgFanRmsAboveBaseline=("fanRmsAboveBaseline", "mean"),
            usageScoreMean=("usageScore", "mean"),
            fanWasteCount=("fanWaste", "sum"),
            lightWasteCount=("lightWaste", "sum"),
            anyWasteCount=("anyWaste", "sum"),
        )
        .reset_index()
        .sort_values("hourStart")
        .reset_index(drop=True)
    )

    hourly["fanWasteMinutes"] = hourly["fanWasteCount"] * SAMPLE_INTERVAL_SECONDS / 60
    hourly["lightWasteMinutes"] = hourly["lightWasteCount"] * SAMPLE_INTERVAL_SECONDS / 60
    hourly["totalWasteMinutes"] = hourly["anyWasteCount"] * SAMPLE_INTERVAL_SECONDS / 60
    hourly["wasteRate"] = np.where(
        hourly["totalReadings"] > 0,
        hourly["anyWasteCount"] / hourly["totalReadings"],
        0,
    )

    return hourly


def label_cluster(row, waste_rank, active_rank):
    cluster_id = row["cluster"]

    if waste_rank[cluster_id] == 0 and row["meanWasteMinutes"] <= 0.5:
        return "Green Hours"

    if waste_rank[cluster_id] == max(waste_rank.values()):
        return "Wasteful Hours"

    if active_rank[cluster_id] == max(active_rank.values()):
        return "Normal Active Hours"

    return "Low Usage Hours"


def run_usage_clustering(hourly):
    if len(hourly) < 3:
        return {
            "status": "insufficient_data",
            "message": "At least 3 hourly profiles are needed for K-Means clustering.",
            "model": "K-Means Clustering",
            "profiles": [],
            "hourlyProfiles": [],
        }

    feature_columns = [
        "hour",
        "dayOfWeek",
        "occupancyRate",
        "fanOnRate",
        "lampOnRate",
        "avgNoMotionSeconds",
        "avgTemperature",
        "avgHumidity",
        "avgFanRmsAboveBaseline",
        "usageScoreMean",
        "wasteRate",
        "totalWasteMinutes",
    ]

    X = hourly[feature_columns].copy().fillna(0)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    cluster_count = min(3, len(hourly))
    model = KMeans(n_clusters=cluster_count, random_state=RANDOM_STATE, n_init=10)
    hourly["cluster"] = model.fit_predict(X_scaled)

    silhouette = None
    if len(hourly) > cluster_count and cluster_count > 1:
        try:
            silhouette = float(silhouette_score(X_scaled, hourly["cluster"]))
        except Exception:
            silhouette = None

    cluster_summary = (
        hourly.groupby("cluster")
        .agg(
            hourCount=("hourStart", "count"),
            meanWasteMinutes=("totalWasteMinutes", "mean"),
            totalWasteMinutes=("totalWasteMinutes", "sum"),
            meanOccupancyRate=("occupancyRate", "mean"),
            meanFanOnRate=("fanOnRate", "mean"),
            meanLampOnRate=("lampOnRate", "mean"),
            meanUsageScore=("usageScoreMean", "mean"),
            meanTemperature=("avgTemperature", "mean"),
        )
        .reset_index()
    )

    waste_sorted = cluster_summary.sort_values("meanWasteMinutes")["cluster"].tolist()
    active_sorted = cluster_summary.sort_values("meanUsageScore")["cluster"].tolist()
    waste_rank = {cluster: rank for rank, cluster in enumerate(waste_sorted)}
    active_rank = {cluster: rank for rank, cluster in enumerate(active_sorted)}

    cluster_summary["profileName"] = cluster_summary.apply(
        lambda row: label_cluster(row, waste_rank, active_rank), axis=1
    )

    label_map = dict(zip(cluster_summary["cluster"], cluster_summary["profileName"]))
    hourly["profileName"] = hourly["cluster"].map(label_map)

    profiles = []
    for _, row in cluster_summary.sort_values("meanWasteMinutes").iterrows():
        profiles.append(
            {
                "cluster": int(row["cluster"]),
                "profileName": row["profileName"],
                "hourCount": int(row["hourCount"]),
                "meanWasteMinutes": round(float(row["meanWasteMinutes"]), 2),
                "totalWasteMinutes": round(float(row["totalWasteMinutes"]), 2),
                "meanOccupancyRatePercent": round(float(row["meanOccupancyRate"] * 100), 1),
                "meanFanOnRatePercent": round(float(row["meanFanOnRate"] * 100), 1),
                "meanLampOnRatePercent": round(float(row["meanLampOnRate"] * 100), 1),
                "meanUsageScore": round(float(row["meanUsageScore"]), 2),
                "meanTemperature": round(float(row["meanTemperature"]), 2),
            }
        )

    wasteful = hourly[hourly["profileName"] == "Wasteful Hours"].copy()
    top_wasteful_periods = []

    if not wasteful.empty:
        period_summary = (
            wasteful.groupby("hour")
            .agg(
                occurrences=("hourStart", "count"),
                totalWasteMinutes=("totalWasteMinutes", "sum"),
                avgFanOnRate=("fanOnRate", "mean"),
                avgOccupancyRate=("occupancyRate", "mean"),
            )
            .reset_index()
            .sort_values("totalWasteMinutes", ascending=False)
            .head(5)
        )

        for _, row in period_summary.iterrows():
            top_wasteful_periods.append(
                {
                    "hour": int(row["hour"]),
                    "occurrences": int(row["occurrences"]),
                    "totalWasteMinutes": round(float(row["totalWasteMinutes"]), 2),
                    "avgFanOnRatePercent": round(float(row["avgFanOnRate"] * 100), 1),
                    "avgOccupancyRatePercent": round(float(row["avgOccupancyRate"] * 100), 1),
                }
            )

    hourly_profiles = []
    for _, row in hourly.tail(36).iterrows():
        hourly_profiles.append(
            {
                "hourStart": row["hourStart"].isoformat(),
                "hour": int(row["hour"]),
                "profileName": row["profileName"],
                "totalWasteMinutes": round(float(row["totalWasteMinutes"]), 2),
                "occupancyRatePercent": round(float(row["occupancyRate"] * 100), 1),
                "fanOnRatePercent": round(float(row["fanOnRate"] * 100), 1),
                "lampOnRatePercent": round(float(row["lampOnRate"] * 100), 1),
            }
        )

    return {
        "status": "completed",
        "model": "K-Means Clustering",
        "clusterCount": cluster_count,
        "featureColumns": feature_columns,
        "silhouetteScore": round(silhouette, 3) if silhouette is not None else None,
        "profiles": profiles,
        "topWastefulPeriods": top_wasteful_periods,
        "hourlyProfiles": hourly_profiles,
    }


def usage_level(value):
    if value < 8:
        return "Low"
    if value < 25:
        return "Medium"
    return "High"


def run_expected_fan_usage_prediction(df):
    if len(df) < 30:
        return {
            "status": "insufficient_data",
            "message": "At least 30 readings are recommended for expected fan usage prediction.",
            "model": "Random Forest Regression",
        }

    feature_columns = [
        "hour",
        "dayOfWeek",
        "temperature",
        "humidity",
        "rawMotionDetected",
        "motionDetected",
        "noMotionSeconds",
        "occupancyHoldRemainingSeconds",
        "previousFanRms",
        "previousUsageScore",
    ]

    target_column = "fanRmsAboveBaseline"

    model_df = df[feature_columns + [target_column, "timestamp", "localTimestamp"]].copy()
    model_df = model_df.replace([np.inf, -np.inf], np.nan).dropna()

    if len(model_df) < 30:
        return {
            "status": "insufficient_data",
            "message": "Not enough clean readings for expected fan usage prediction.",
            "model": "Random Forest Regression",
        }

    X = model_df[feature_columns]
    y = model_df[target_column]

    test_size = 0.25 if len(model_df) >= 80 else 0.30
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, shuffle=False
    )

    model = RandomForestRegressor(
        n_estimators=120,
        max_depth=8,
        random_state=RANDOM_STATE,
        min_samples_leaf=2,
    )
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    rmse = mean_squared_error(y_test, predictions) ** 0.5

    try:
        r2 = r2_score(y_test, predictions)
    except Exception:
        r2 = None

    latest_features = X.tail(1)
    expected_latest = float(model.predict(latest_features)[0])
    latest_row = model_df.tail(1).iloc[0]
    actual_latest = float(latest_row[target_column])
    difference = actual_latest - expected_latest

    comparison_level = "normal"
    if difference > max(10, mae * 1.5):
        comparison_level = "higher_than_expected"
    elif difference < -max(10, mae * 1.5):
        comparison_level = "lower_than_expected"

    recent_comparisons = []
    test_indices = y_test.tail(12).index
    test_prediction_series = pd.Series(predictions, index=y_test.index)

    for idx in test_indices:
        recent_comparisons.append(
            {
                "timestamp": model_df.loc[idx, "localTimestamp"].isoformat(),
                "expectedFanRms": round(float(test_prediction_series.loc[idx]), 2),
                "actualFanRms": round(float(model_df.loc[idx, target_column]), 2),
                "difference": round(float(model_df.loc[idx, target_column] - test_prediction_series.loc[idx]), 2),
            }
        )

    importances = sorted(
        [
            {"feature": feature, "importance": round(float(importance), 4)}
            for feature, importance in zip(feature_columns, model.feature_importances_)
        ],
        key=lambda x: x["importance"],
        reverse=True,
    )

    return {
        "status": "completed",
        "model": "Random Forest Regression",
        "predictionTarget": "Expected fan current usage (fanRmsAboveBaseline)",
        "featureColumns": feature_columns,
        "totalRecords": int(len(model_df)),
        "evaluation": {
            "mae": round(float(mae), 2),
            "rmse": round(float(rmse), 2),
            "r2Score": round(float(r2), 3) if r2 is not None else None,
        },
        "latestComparison": {
            "timestamp": latest_row["localTimestamp"].isoformat(),
            "expectedFanRms": round(expected_latest, 2),
            "actualFanRms": round(actual_latest, 2),
            "difference": round(float(difference), 2),
            "expectedLevel": usage_level(expected_latest),
            "actualLevel": usage_level(actual_latest),
            "comparisonLevel": comparison_level,
        },
        "featureImportance": importances[:8],
        "recentComparisons": recent_comparisons,
    }


def run_next_hour_waste_prediction(hourly):
    if len(hourly) < 8:
        return {
            "status": "insufficient_data",
            "message": "At least 8 hourly profiles are recommended for next-hour waste prediction.",
            "model": "Random Forest Regression",
        }

    hourly = hourly.copy().sort_values("hourStart").reset_index(drop=True)
    hourly["nextHourWasteMinutes"] = hourly["totalWasteMinutes"].shift(-1)

    model_df = hourly.dropna(subset=["nextHourWasteMinutes"]).copy()

    feature_columns = [
        "hour",
        "dayOfWeek",
        "occupancyRate",
        "fanOnRate",
        "lampOnRate",
        "avgNoMotionSeconds",
        "avgTemperature",
        "avgHumidity",
        "avgFanRmsAboveBaseline",
        "usageScoreMean",
        "wasteRate",
        "totalWasteMinutes",
    ]

    if len(model_df) < 6:
        return {
            "status": "insufficient_data",
            "message": "Not enough hourly rows with a next-hour target.",
            "model": "Random Forest Regression",
        }

    X = model_df[feature_columns].fillna(0)
    y = model_df["nextHourWasteMinutes"]

    if len(model_df) >= 10:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, shuffle=False
        )
    else:
        X_train, X_test, y_train, y_test = X.iloc[:-2], X.iloc[-2:], y.iloc[:-2], y.iloc[-2:]

    model = RandomForestRegressor(
        n_estimators=120,
        max_depth=6,
        random_state=RANDOM_STATE,
        min_samples_leaf=1,
    )
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    rmse = mean_squared_error(y_test, predictions) ** 0.5

    latest_features = hourly[feature_columns].tail(1).fillna(0)
    predicted_next_hour = max(0, float(model.predict(latest_features)[0]))
    latest_hour = hourly.tail(1).iloc[0]

    if predicted_next_hour >= 15:
        risk_level = "High"
    elif predicted_next_hour >= 5:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    recent_predictions = []
    pred_series = pd.Series(predictions, index=y_test.index)
    for idx in y_test.index:
        recent_predictions.append(
            {
                "hourStart": model_df.loc[idx, "hourStart"].isoformat(),
                "predictedNextHourWasteMinutes": round(float(pred_series.loc[idx]), 2),
                "actualNextHourWasteMinutes": round(float(model_df.loc[idx, "nextHourWasteMinutes"]), 2),
            }
        )

    return {
        "status": "completed",
        "model": "Random Forest Regression",
        "predictionTarget": "Next-hour waste minutes",
        "featureColumns": feature_columns,
        "totalHourlyProfiles": int(len(hourly)),
        "evaluation": {
            "mae": round(float(mae), 2),
            "rmse": round(float(rmse), 2),
        },
        "forecast": {
            "basedOnHour": latest_hour["hourStart"].isoformat(),
            "predictedNextHourWasteMinutes": round(predicted_next_hour, 2),
            "riskLevel": risk_level,
        },
        "recentPredictions": recent_predictions,
    }


def run_correlation_analysis(df):
    columns = [
        "temperature",
        "humidity",
        "rawMotionDetected",
        "motionDetected",
        "noMotionSeconds",
        "occupancyHoldRemainingSeconds",
        "lampOn",
        "fanOn",
        "fanRmsAboveBaseline",
        "usageScore",
        "anyWaste",
    ]

    existing_columns = [col for col in columns if col in df.columns]
    corr_df = df[existing_columns].corr(numeric_only=True)

    target = "anyWaste"

    if target not in corr_df.columns:
        return {
            "status": "insufficient_data",
            "target": target,
            "topRelationships": [],
        }

    correlations = (
        corr_df[target]
        .drop(target, errors="ignore")
        .dropna()
        .sort_values(key=lambda x: x.abs(), ascending=False)
    )

    top_relationships = []

    for feature, value in correlations.head(5).items():
        top_relationships.append(
            {
                "feature": feature,
                "correlationWithWaste": round(float(value), 3),
            }
        )

    return {
        "status": "completed",
        "target": target,
        "topRelationships": top_relationships,
        "note": "Rule-output fields such as fanWaste and lightWaste were excluded to avoid circular analysis.",
    }


def run_pattern_analysis(df):
    hourly = (
        df.groupby("hour")
        .agg(
            totalReadings=("timestamp", "count"),
            fanRuntime=("fanOn", "sum"),
            lampRuntime=("lampOn", "sum"),
            motionCount=("motionDetected", "sum"),
            fanWasteCount=("fanWaste", "sum"),
            lightWasteCount=("lightWaste", "sum"),
            anyWasteCount=("anyWaste", "sum"),
        )
        .reset_index()
    )

    hourly["wasteMinutes"] = hourly["anyWasteCount"] * SAMPLE_INTERVAL_SECONDS / 60

    peak_hours = hourly.sort_values("wasteMinutes", ascending=False).head(5)

    peak_waste_hours = []

    for _, row in peak_hours.iterrows():
        if row["wasteMinutes"] <= 0:
            continue

        peak_waste_hours.append(
            {
                "hour": int(row["hour"]),
                "wasteMinutes": round(float(row["wasteMinutes"]), 2),
                "fanWasteCount": int(row["fanWasteCount"]),
                "lightWasteCount": int(row["lightWasteCount"]),
            }
        )

    return {
        "status": "completed",
        "peakWasteHours": peak_waste_hours,
    }


def run_trend_analysis(df):
    df = df.copy()
    df["date"] = df["localTimestamp"].dt.date

    daily = (
        df.groupby("date")
        .agg(
            readings=("timestamp", "count"),
            anyWasteCount=("anyWaste", "sum"),
            fanWasteCount=("fanWaste", "sum"),
            lightWasteCount=("lightWaste", "sum"),
        )
        .reset_index()
    )

    daily["wasteMinutes"] = daily["anyWasteCount"] * SAMPLE_INTERVAL_SECONDS / 60

    daily_records = [
        {
            "date": str(row["date"]),
            "wasteMinutes": round(float(row["wasteMinutes"]), 2),
            "fanWasteCount": int(row["fanWasteCount"]),
            "lightWasteCount": int(row["lightWasteCount"]),
        }
        for _, row in daily.iterrows()
    ]

    if len(daily) < 2:
        return {
            "status": "limited_data",
            "message": "More than one day of data is needed for a stronger trend.",
            "dailyWaste": daily_records,
            "trendDirection": "not_enough_days",
        }

    X = np.arange(len(daily)).reshape(-1, 1)
    y = daily["wasteMinutes"].values

    model = LinearRegression()
    model.fit(X, y)

    slope = float(model.coef_[0])

    if slope > 1:
        trend_direction = "increasing_waste"
    elif slope < -1:
        trend_direction = "decreasing_waste"
    else:
        trend_direction = "stable"

    return {
        "status": "completed",
        "model": "Linear Regression over daily waste minutes",
        "dailyWaste": daily_records,
        "slopeWasteMinutesPerDay": round(slope, 3),
        "trendDirection": trend_direction,
    }


def build_recommendations(clustering_result, fan_prediction_result, next_hour_prediction_result, correlation_result, pattern_result, trend_result):
    recommendations = []

    wasteful_periods = clustering_result.get("topWastefulPeriods", [])
    if wasteful_periods:
        top = wasteful_periods[0]
        recommendations.append(
            f"K-Means identified {top['hour']}:00 as a repeated wasteful profile. Fan use was active while occupancy was low during this period."
        )

    latest_comparison = fan_prediction_result.get("latestComparison")
    if latest_comparison:
        if latest_comparison.get("comparisonLevel") == "higher_than_expected":
            recommendations.append(
                "Actual fan current is higher than the model expected for this time and occupancy context. Check whether the fan is needed."
            )
        elif latest_comparison.get("comparisonLevel") == "normal":
            recommendations.append(
                "Current fan usage is close to the expected pattern for this context."
            )

    forecast = next_hour_prediction_result.get("forecast")
    if forecast:
        if forecast.get("riskLevel") == "High":
            recommendations.append(
                f"The next-hour model predicts high waste risk ({forecast['predictedNextHourWasteMinutes']} minutes). Monitor appliance usage soon."
            )
        elif forecast.get("riskLevel") == "Medium":
            recommendations.append(
                f"The next-hour model predicts moderate waste risk ({forecast['predictedNextHourWasteMinutes']} minutes)."
            )

    peak_hours = pattern_result.get("peakWasteHours", [])
    if peak_hours:
        top_hour = peak_hours[0]["hour"]
        recommendations.append(
            f"Peak historical waste was observed around {top_hour}:00. Pay extra attention to fan/lamp usage during this period."
        )

    if trend_result.get("trendDirection") == "increasing_waste":
        recommendations.append(
            "Daily waste appears to be increasing. Reduce appliance use during unoccupied periods."
        )
    elif trend_result.get("trendDirection") == "decreasing_waste":
        recommendations.append(
            "Daily waste appears to be reducing. Current behaviour is improving."
        )

    top_corr = correlation_result.get("topRelationships", [])
    if top_corr:
        strongest = top_corr[0]
        recommendations.append(
            f"The strongest non-circular relationship with waste is {strongest['feature']} "
            f"(correlation {strongest['correlationWithWaste']})."
        )

    if not recommendations:
        recommendations.append("Continue collecting data for stronger smart usage insights.")

    return recommendations


def main():
    print("Starting smart usage ML analysis...")

    mongo_uri = load_mongo_uri()
    client = MongoClient(mongo_uri)
    db = get_database_from_uri(client)

    df, start_time, end_time = load_readings(db)

    print(f"Loaded {len(df)} records.")

    if len(df) == 0:
        print("No data found. Keep ESP32 running and try again.")
        return

    df = prepare_features(df)
    hourly = build_hourly_profiles(df)

    clustering_result = run_usage_clustering(hourly)
    expected_fan_usage_result = run_expected_fan_usage_prediction(df)
    next_hour_waste_result = run_next_hour_waste_prediction(hourly)
    correlation_result = run_correlation_analysis(df)
    pattern_result = run_pattern_analysis(df)
    trend_result = run_trend_analysis(df)

    recommendations = build_recommendations(
        clustering_result,
        expected_fan_usage_result,
        next_hour_waste_result,
        correlation_result,
        pattern_result,
        trend_result,
    )

    result_doc = {
        "roomId": ROOM_ID,
        "analysisType": "smart_usage_ml_analysis",
        "generatedAt": datetime.now(timezone.utc),
        "dataRange": {
            "start": start_time,
            "end": end_time,
            "totalRecords": int(len(df)),
            "totalHourlyProfiles": int(len(hourly)),
        },
        "usageClustering": clustering_result,
        "expectedFanUsagePrediction": expected_fan_usage_result,
        "nextHourWastePrediction": next_hour_waste_result,
        "correlationAnalysis": correlation_result,
        "patternAnalysis": pattern_result,
        "trendAnalysis": trend_result,
        "recommendations": recommendations,
    }

    db["ml_results"].insert_one(result_doc)

    print("Smart usage ML analysis completed and saved to MongoDB.")
    print("Summary:")
    print(f"- Records analysed: {len(df)}")
    print(f"- Hourly profiles analysed: {len(hourly)}")
    print(f"- Clustering status: {clustering_result.get('status')}")
    print(f"- Fan prediction status: {expected_fan_usage_result.get('status')}")
    print(f"- Next-hour prediction status: {next_hour_waste_result.get('status')}")
    print(f"- Recommendations: {len(recommendations)}")


if __name__ == "__main__":
    main()
