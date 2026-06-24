# Room Habit Energy-Waste Detective

## Overview

Room Habit Energy-Waste Detective is an IoT and Machine Learning-based smart energy monitoring system designed to identify and predict energy wastage in indoor environments.

The system collects real-time data from multiple sensors, analyzes room occupancy and energy consumption patterns, and uses machine learning techniques to detect anomalies, predict wasteful behavior, and generate actionable recommendations for improving energy efficiency.

## Problem Statement

Energy is often wasted when electrical devices such as fans, air conditioners, and lights remain active while rooms are unoccupied or when environmental conditions do not require their usage.

This project aims to:

* Detect energy waste in real time
* Monitor room occupancy and environmental conditions
* Identify abnormal energy consumption patterns
* Predict future energy waste events
* Provide recommendations to reduce unnecessary power consumption

---

## Features

### Real-Time Sensor Monitoring

* Occupancy detection using PIR Motion Sensor
* Light intensity monitoring using LDR Sensor
* Temperature and humidity monitoring using DHT22 Sensor
* Appliance power usage monitoring using ACS712 Current Sensor (or vibration sensor alternative)

### Machine Learning Analytics

* Energy waste anomaly detection
* User behavior pattern analysis
* Usage clustering
* Fan usage prediction
* Next-hour energy waste prediction
* Correlation analysis between occupancy, environment, and power usage
* Trend analysis and reporting

### Smart Recommendations

* Detects fans or AC units running in empty rooms
* Detects lights left on during daylight hours
* Identifies abnormal energy consumption patterns
* Generates recommendations to improve energy efficiency

### Dashboard Visualization

* Live sensor monitoring
* Historical data visualization
* ML prediction results
* Energy waste alerts
* Usage trends and analytics

---

## System Architecture

### IoT Layer

* PIR Motion Sensor → Occupancy Detection
* LDR Sensor → Light Detection
* DHT22 Sensor → Temperature & Humidity Monitoring
* ACS712 Current Sensor → Power Consumption Monitoring

### Backend Layer

* Node.js
* Express.js
* MongoDB
* Mongoose

### Machine Learning Layer

* Anomaly Detection
* Usage Clustering
* Predictive Analytics
* Trend Analysis
* Pattern Recognition

### Frontend Layer

* Web Dashboard
* Real-Time Monitoring
* Energy Waste Alerts
* Analytics Visualization

---

## Machine Learning Components

The system performs several machine learning analyses:

### 1. Anomaly Detection

Identifies unusual energy consumption patterns such as:

* High power consumption with no occupancy
* Lights remaining on during daylight
* Excessive fan or AC operation

### 2. Usage Clustering

Groups room usage behavior into different patterns based on:

* Occupancy
* Environmental conditions
* Appliance usage

### 3. Expected Fan Usage Prediction

Predicts expected fan operation using:

* Temperature
* Humidity
* Historical usage patterns

### 4. Next-Hour Waste Prediction

Forecasts the likelihood of energy waste occurring within the next hour.

### 5. Correlation Analysis

Analyzes relationships between:

* Occupancy and power consumption
* Temperature and fan usage
* Light levels and lighting usage

### 6. Trend Analysis

Identifies long-term energy consumption and occupancy trends.

---

## Technologies Used

### Hardware

* PIR Motion Sensor
* LDR Light Sensor
* DHT22 Temperature & Humidity Sensor
* ACS712 Current Sensor

### Software

* Node.js
* Express.js
* MongoDB
* Mongoose
* JavaScript

### Machine Learning

* Anomaly Detection
* Clustering
* Predictive Modeling
* Time-Series Analysis

---

## Example Energy Waste Scenarios

### Scenario 1

Fan running for 30 minutes with no detected occupancy.

Result:

* Energy waste alert generated
* Anomaly detected
* Recommendation issued

### Scenario 2

Lights remain ON during daylight hours.

Result:

* Waste event detected
* User notified through dashboard

### Scenario 3

Fan usage significantly higher than expected temperature-based predictions.

Result:

* Predictive model flags abnormal behavior
* Recommendation generated

---

## Team Contributions

This project was developed as a collaborative group project focusing on:

* IoT Sensor Integration
* Data Collection and Processing
* Machine Learning Model Development
* Backend API Development
* Dashboard Development
* Energy Waste Analytics

---

## Future Improvements

* Smart device automation
* Mobile application support
* Reinforcement learning for energy optimization
* Cloud deployment
* Smart home integration
* Real-time notification system

---

## Project Goal

To create an intelligent energy management system that helps users reduce electricity consumption, identify wasteful habits, and promote sustainable energy usage through IoT and Machine Learning technologies.
