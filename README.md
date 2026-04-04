<div align="center">

<img src="https://img.shields.io/badge/🧫-FERMENTOR-2563eb?style=for-the-badge&labelColor=1e293b&color=2563eb" alt="Fermentor"/>

# IIoT Fermenter · DO & pH ML Dashboard

*Real-time Fermentation Monitoring with Machine Learning Predictions*

[![Python](https://img.shields.io/badge/Python-3.11-3776ab?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-1.7.1-f7931e?style=flat-square&logo=scikit-learn&logoColor=white)](https://scikit-learn.org)
[![Pandas](https://img.shields.io/badge/Pandas-2.x-150458?style=flat-square&logo=pandas&logoColor=white)](https://pandas.pydata.org)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-f7df1e?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Render](https://img.shields.io/badge/Deployed_on-Render-46e3b7?style=flat-square&logo=render&logoColor=white)](https://render.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

<br/>

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Open_Dashboard-2563eb?style=for-the-badge)](https://ai-fermenter-9eq9.onrender.com/)

</div>

---

## Overview

**IIoT Fermenter** is an industrial IoT monitoring platform for real-time fermentation process control. It uses trained **Random Forest and Gradient Boosting ML models** to predict Dissolved Oxygen (DO) and pH levels 5 minutes ahead, enabling proactive pump automation before values go out of range.

The system supports three data sources — built-in simulation, a Python REST API with real `.pkl` models, and live ESP32 sensor hardware — all visualized through a responsive web dashboard.

---

## ✨ Features

| Feature | Description |
|---|---|
| **ML Predictions** | Random Forest (DO/pH regression) + Gradient Boosting (alarm classification) trained on 1,500 simulated fermentation cycles |
| **14-Feature Engineering** | Rolling mean/std (3-point window), trend deltas, and setpoint distance features engineered at inference time |
| **3 Alarm Levels** | NORMAL · WARNING · CRITICAL — predicted 5 minutes ahead of actual threshold breach |
| **Auto Pump Control** | Rule-based DO and pH correction via Air, Base, and Acid pumps |
| **Live Charts** | Canvas-rendered Actual vs. Predicted time-series for DO and pH |
| **3 Data Modes** | Simulation (local) · Python API (real models) · ESP32 HTTP (hardware) |
| **Zero Build Step** | Pure HTML/CSS/JS frontend — no Node, no npm, no bundler required |
| **Render Ready** | Auto-detects deployed vs. local environment; uses `PORT` env variable |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (dashboard.html)             │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Gauges  │  │ ML Prediction│  │   Pump Control   │  │
│  │  DO / pH │  │  DO · pH ·   │  │ Air · Base · Acid│  │
│  │  (SVG)   │  │  Alarm State │  │   (Rule-Based)   │  │
│  └──────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │    DO Chart (Canvas) │  │    pH Chart (Canvas)     │ │
│  └──────────────────────┘  └──────────────────────────┘ │
└─────────────────┬───────────────────────────────────────┘
                  │  REST API (fetch)
┌─────────────────▼───────────────────────────────────────┐
│                 Flask API  (api_server.py)               │
│                                                         │
│  POST /predict   ← 14-feature vector → DO/pH/Alarm      │
│  GET  /simulate  ← Physics-based sensor emulator        │
│  GET  /history   ← Last N predictions                   │
│  GET  /status    ← Health check + model info            │
│  GET  /          ← Serves dashboard.html                │
└──────────┬─────────────────┬───────────────────────────-┘
           │                 │
  ┌────────▼──────┐  ┌───────▼────────┐
  │ model_DO_v2   │  │ model_alarm_v2 │
  │ (RF Regressor)│  │ (GB Classifier)│
  └───────────────┘  └────────────────┘
           │
  ┌────────▼──────┐
  │ model_pH_v2   │
  │ (RF Regressor)│
  └───────────────┘
```

---

## 🧠 ML Models

### Training Data
- **1,500 simulated fermentation cycles** with injected fault events every 80 steps
- 5-minute sampling interval, ~125 hours of process time
- Class-balanced with CRITICAL events (DO < 4.5 mg/L or pH outside 5.8–8.2)

### Engineered Features (14 total)

| Feature | Description |
|---|---|
| `DO`, `pH` | Current sensor readings |
| `air_pump`, `acid_pump`, `base_pump` | Current actuator states (0/1) |
| `DO_roll_mean3`, `pH_roll_mean3` | 3-point rolling average (15 min window) |
| `DO_roll_std3`, `pH_roll_std3` | 3-point rolling standard deviation |
| `DO_delta`, `pH_delta` | Rate of change vs. previous reading |
| `DO_from_low` | Distance from DO lower setpoint (5.5 mg/L) |
| `pH_from_low` | Distance from pH lower setpoint (6.5) |
| `pH_from_high` | Distance from pH upper setpoint (7.5) |

### Model Performance

| Model | Task | Algorithm | Notes |
|---|---|---|---|
| `model_DO_v2.pkl` | DO regression | Random Forest (100 trees) | Predicts next DO value |
| `model_pH_v2.pkl` | pH regression | Random Forest (100 trees) | Predicts next pH value |
| `model_alarm_v2.pkl` | Alarm classification | Gradient Boosting (200 est.) | 3-class: Normal / Warning / Critical |

---

## 🚀 Quick Start

### Prerequisites

```bash
Python 3.9+
pip
```

### Local Run

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/fermentor-dashboard.git
cd fermentor-dashboard

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the server
python api_server.py

# 4. Open in browser
# http://localhost:5000
```

### Using the Dashboard

| Mode | When to Use |
|---|---|
| **Simulate** | Default — physics-based local simulation, no server needed |
| **Python API** | Connects to Flask backend and runs real `.pkl` ML models |
| **ESP32 HTTP** | Reads live sensor data from ESP32 over your local Wi-Fi |

---

## 📡 API Reference

Base URL: `http://localhost:5000` (local) or your Render URL (deployed)

### `POST /predict`

Run ML inference with all 14 engineered features.

**Request body:**
```json
{
  "DO": 5.8,
  "pH": 6.9,
  "air_pump": 0,
  "acid_pump": 0,
  "base_pump": 0
}
```

**Response:**
```json
{
  "predicted_DO": 5.712,
  "predicted_pH": 6.881,
  "alarm_label": 1,
  "alarm_text": "WARNING",
  "alarm_color": "#d97706",
  "auto_control": {
    "air_pump": false,
    "base_pump": false,
    "acid_pump": false
  },
  "features_used": 14,
  "timestamp": "2026-04-04 23:05:42"
}
```

### `GET /simulate`

Returns one simulated ESP32 sensor reading.

```json
{ "DO": 5.623, "pH": 6.481, "source": "simulated_esp32", "timestamp": "..." }
```

### `GET /status`

Health check — confirms all 3 models are loaded.

### `GET /history?n=60`

Returns last N prediction records for chart rendering.

---

## 🌐 Deploy to Render (Free)

1. **Push to GitHub** — all `.pkl` files are under 100MB, no Git LFS needed
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repository and configure:

   | Setting | Value |
   |---|---|
   | Runtime | Python 3 |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `gunicorn api_server:app` |
   | Instance Type | Free |

4. Deploy — your app will be live at `https://your-app.onrender.com`

> **Note:** Free tier sleeps after 15 min of inactivity. First request after sleep takes ~30 seconds.

---

## 📁 Project Structure

```
fermentor-dashboard/
│
├── api_server.py              # Flask REST API + feature engineering
├── dashboard.html             # Frontend dashboard (pure HTML/CSS/JS)
├── requirements.txt           # Python dependencies
├── .gitignore
│
├── model_DO_v2.pkl            # Trained DO regressor (Random Forest)
├── model_pH_v2.pkl            # Trained pH regressor (Random Forest)
├── model_alarm_v2.pkl         # Trained alarm classifier (Gradient Boosting)
├── model_alarm_gb.pkl         # Alternative GB alarm model
├── feature_names.pkl          # Saved feature list for validation
│
├── improve_models.py          # Model training + feature engineering script
└── fermentation_dataset_v2.csv  # 1,500-row simulated training dataset
```

---

## 🔬 Alarm Thresholds

| Parameter | Normal | Warning | Critical |
|---|---|---|---|
| Dissolved Oxygen | 5.5 – 7.0 mg/L | < 5.5 or > 7.0 | < 4.5 |
| pH | 6.5 – 7.5 | < 6.5 or > 7.5 | < 5.8 or > 8.2 |

---

## 🛠️ ESP32 Integration

Your ESP32 firmware should expose a JSON endpoint on the local network:

```cpp
// Expected response format
server.on("/data", HTTP_GET, []() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  String json = "{\"DO\":" + String(do_sensor_val, 3) +
                ",\"pH\":" + String(ph_sensor_val, 3) + "}";
  server.send(200, "application/json", json);
});
```

Set the dashboard to **ESP32 HTTP mode** and enter `http://<ESP32-IP>/data`.

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ for IIoT Process Monitoring &nbsp;·&nbsp; IOT2526486

[![Python](https://img.shields.io/badge/Python-3776ab?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-000000?style=flat-square&logo=flask)](https://flask.palletsprojects.com)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-f7931e?style=flat-square&logo=scikit-learn&logoColor=white)](https://scikit-learn.org)
[![Render](https://img.shields.io/badge/Render-46e3b7?style=flat-square&logo=render&logoColor=white)](https://render.com)

</div>
