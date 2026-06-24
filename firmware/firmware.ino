#include <WiFi.h>
#include <HTTPClient.h>
#include "DHT.h"
#include <WiFiClientSecure.h>

//WIFI SETTINGS
const char* WIFI_SSID = "SLT-Fiber-yz7P8-2.4G";
const char* WIFI_PASSWORD = "KExHM8H7";
const char* SERVER_URL = "https://iothabit.onrender.com/api/readings";

//SENSOR PINS
#define DHTPIN 14
#define DHTTYPE DHT22

#define PIR_PIN 27
#define LIGHT_PIN 26
#define ACS_PIN 34

DHT dht(DHTPIN, DHTTYPE);

// COLLECTION SETTINGS
const unsigned long SENSOR_READ_INTERVAL_MS = 30000;   // send every 30 seconds
const unsigned long OCCUPANCY_HOLD_MS = 120000;        // 2 minutes occupancy memory
const unsigned long NO_MOTION_THRESHOLD_MS = 300000;   // 5 minutes before waste alert


// ACS712 SETTINGS
const float FAN_ON_THRESHOLD = 25.0;

// VARIABLES
float baselineRMS = 0;

unsigned long lastSensorReadTime = 0;
unsigned long lastMotionTime = 0;

bool rawMotionDetected = false;
bool occupancyDetected = false;
bool lampOn = false;
bool fanOn = false;
bool fanWaste = false;
bool lightWaste = false;

float temperature = NAN;
float humidity = NAN;
float latestRmsAboveBaseline = 0;

struct ACSStats {
  float avg;
  float rms;
  int minVal;
  int maxVal;
  int peakToPeak;
};

//  WIFI CONNECT 
void connectToWiFi() {
  Serial.println("Connecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;

  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected!");
    Serial.print("ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection failed. Check SSID/password/network.");
  }
}

// ACS712 READ FUNCTION 
ACSStats readACS(int samples = 700) {
  long sum = 0;
  int minVal = 4095;
  int maxVal = 0;

  for (int i = 0; i < samples; i++) {
    int value = analogRead(ACS_PIN);

    sum += value;

    if (value < minVal) minVal = value;
    if (value > maxVal) maxVal = value;

    delayMicroseconds(400);
  }

  float avg = sum / (float)samples;

  float squareSum = 0;

  for (int i = 0; i < samples; i++) {
    int value = analogRead(ACS_PIN);
    float diff = value - avg;
    squareSum += diff * diff;

    delayMicroseconds(400);
  }

  float rms = sqrt(squareSum / samples);

  ACSStats stats;
  stats.avg = avg;
  stats.rms = rms;
  stats.minVal = minVal;
  stats.maxVal = maxVal;
  stats.peakToPeak = maxVal - minVal;

  return stats;
}

//  ACS712 CALIBRATION
void calibrateACS() {
  Serial.println("================================");
  Serial.println("Calibrating ACS712 current sensor...");
  Serial.println("IMPORTANT: Keep fan OFF/unplugged during calibration.");
  Serial.println("================================");

  delay(3000);

  float totalRMS = 0;

  for (int i = 0; i < 5; i++) {
    ACSStats s = readACS();
    totalRMS += s.rms;

    Serial.print("Calibration sample ");
    Serial.print(i + 1);
    Serial.print(" RMS: ");
    Serial.println(s.rms);

    delay(500);
  }

  baselineRMS = totalRMS / 5.0;

  Serial.println("--------------------------------");
  Serial.print("Baseline RMS learned: ");
  Serial.println(baselineRMS);
  Serial.println("--------------------------------");
}

String buildJsonPayload(
  unsigned long currentTime,
  int noMotionSeconds,
  int occupancyHoldRemainingSeconds
) {
  String roomStatus = (fanWaste || lightWaste) ? "WASTE_DETECTED" : "NORMAL";

  String payload = "{";

  payload += "\"roomId\":\"desk_room_01\",";
  payload += "\"deviceId\":\"esp32_01\",";
  payload += "\"uptimeMs\":";
  payload += String(currentTime);
  payload += ",";

  payload += "\"temperature\":";
  if (isnan(temperature)) payload += "null";
  else payload += String(temperature, 2);
  payload += ",";

  payload += "\"humidity\":";
  if (isnan(humidity)) payload += "null";
  else payload += String(humidity, 2);
  payload += ",";

  // Raw PIR momentary reading
  payload += "\"rawMotionDetected\":";
  payload += rawMotionDetected ? "true" : "false";
  payload += ",";

  // Smoothed occupancy state using hold timer
  payload += "\"motionDetected\":";
  payload += occupancyDetected ? "true" : "false";
  payload += ",";

  payload += "\"noMotionSeconds\":";
  payload += String(noMotionSeconds);
  payload += ",";

  payload += "\"occupancyHoldRemainingSeconds\":";
  payload += String(occupancyHoldRemainingSeconds);
  payload += ",";

  payload += "\"lampOn\":";
  payload += lampOn ? "true" : "false";
  payload += ",";

  payload += "\"fanOn\":";
  payload += fanOn ? "true" : "false";
  payload += ",";

  payload += "\"fanRmsAboveBaseline\":";
  payload += String(latestRmsAboveBaseline, 2);
  payload += ",";

  payload += "\"fanWaste\":";
  payload += fanWaste ? "true" : "false";
  payload += ",";

  payload += "\"lightWaste\":";
  payload += lightWaste ? "true" : "false";
  payload += ",";

  payload += "\"roomStatus\":\"";
  payload += roomStatus;
  payload += "\"";

  payload += "}";

  return payload;
}

//  SEND TO BACKEND
void sendToBackend(String jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Trying to reconnect...");
    connectToWiFi();
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  int httpResponseCode = http.POST(jsonPayload);

  Serial.print("HTTP Response Code: ");
  Serial.println(httpResponseCode);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Server Response:");
    Serial.println(response);
  } else {
    Serial.println("Failed to send data to backend.");
    Serial.print("Error: ");
    Serial.println(http.errorToString(httpResponseCode));
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  dht.begin();

  pinMode(PIR_PIN, INPUT);
  pinMode(LIGHT_PIN, INPUT);

  analogReadResolution(12);
  analogSetPinAttenuation(ACS_PIN, ADC_11db);

  Serial.println("Room Habit Energy Waste Detection System");
  Serial.println("Collection version with PIR occupancy hold started.");
  Serial.println("Wait 30-60 seconds for PIR to stabilize.");

  connectToWiFi();

  calibrateACS();

  lastMotionTime = millis();
}

void loop() {
  unsigned long currentTime = millis();

  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL_MS) {
    lastSensorReadTime = currentTime;

    // DHT22 
    temperature = dht.readTemperature();
    humidity = dht.readHumidity();

    // PIR WITH OCCUPANCY HOLD
    int pirRaw = digitalRead(PIR_PIN);
    rawMotionDetected = (pirRaw == HIGH);

    if (rawMotionDetected) {
      lastMotionTime = currentTime;
    }

    unsigned long noMotionDurationMs = currentTime - lastMotionTime;
    int noMotionSeconds = noMotionDurationMs / 1000;

    occupancyDetected = noMotionDurationMs <= OCCUPANCY_HOLD_MS;

    int occupancyHoldRemainingSeconds = 0;

    if (occupancyDetected) {
      occupancyHoldRemainingSeconds =
        (OCCUPANCY_HOLD_MS - noMotionDurationMs) / 1000;
    }

    bool noMotionLongEnough = noMotionDurationMs >= NO_MOTION_THRESHOLD_MS;

    //  LIGHT SENSOR
    int lightRaw = digitalRead(LIGHT_PIN);

    lampOn = (lightRaw == LOW);

    //  CURRENT SENSOR
    ACSStats currentStats = readACS();

    latestRmsAboveBaseline = currentStats.rms - baselineRMS;

    if (latestRmsAboveBaseline < 0) {
      latestRmsAboveBaseline = 0;
    }

    fanOn = latestRmsAboveBaseline > FAN_ON_THRESHOLD;

    // WASTE LOGIC
    fanWaste = fanOn && noMotionLongEnough;
    lightWaste = lampOn && noMotionLongEnough;

    String roomStatus = (fanWaste || lightWaste) ? "WASTE_DETECTED" : "NORMAL";

    Serial.println();
    Serial.println("================================");

    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("DHT22: Failed to read");
    } else {
      Serial.print("Temperature: ");
      Serial.print(temperature);
      Serial.println(" °C");

      Serial.print("Humidity: ");
      Serial.print(humidity);
      Serial.println(" %");
    }

    Serial.print("Raw PIR Motion: ");
    Serial.println(rawMotionDetected ? "DETECTED" : "NO RAW MOTION");

    Serial.print("Occupancy Status: ");
    Serial.println(occupancyDetected ? "OCCUPIED" : "UNOCCUPIED");

    Serial.print("No Motion Duration: ");
    Serial.print(noMotionSeconds);
    Serial.println(" seconds");

    Serial.print("Occupancy Hold Remaining: ");
    Serial.print(occupancyHoldRemainingSeconds);
    Serial.println(" seconds");

    Serial.print("Lamp: ");
    Serial.println(lampOn ? "ON" : "OFF");

    Serial.print("Fan: ");
    Serial.println(fanOn ? "ON" : "OFF");

    Serial.print("Fan RMS Above Baseline: ");
    Serial.println(latestRmsAboveBaseline);

    Serial.println("---- Waste Detection ----");

    Serial.print("Fan Waste: ");
    Serial.println(fanWaste ? "YES" : "NO");

    Serial.print("Light Waste: ");
    Serial.println(lightWaste ? "YES" : "NO");

    Serial.print("Room Status: ");
    Serial.println(roomStatus);

    String jsonPayload = buildJsonPayload(
      currentTime,
      noMotionSeconds,
      occupancyHoldRemainingSeconds
    );

    Serial.println("---- JSON Payload ----");
    Serial.println(jsonPayload);

    sendToBackend(jsonPayload);

    Serial.println("================================");
  }
}
