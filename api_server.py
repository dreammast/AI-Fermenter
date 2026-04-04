# ══════════════════════════════════════════════════════════════════════════════
#  IIoT Fermenter — Python API Backend  (FIXED: enhanced feature engineering)
#  Run: python api_server.py
#  Dashboard: http://localhost:5000/
# ══════════════════════════════════════════════════════════════════════════════

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np
import os
import datetime
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

# ─── Load trained models ──────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

print("Loading ML models...")
model_DO    = joblib.load(os.path.join(BASE_DIR, "model_DO_v2.pkl"))
model_pH    = joblib.load(os.path.join(BASE_DIR, "model_pH_v2.pkl"))
model_alarm = joblib.load(os.path.join(BASE_DIR, "model_alarm_v2.pkl"))
print("✅ All 3 models loaded successfully.")

# ─── Feature list (must match training exactly) ───────────────────────────────
FEATURES = [
    'DO', 'pH', 'air_pump', 'acid_pump', 'base_pump',
    'DO_roll_mean3', 'pH_roll_mean3',
    'DO_roll_std3',  'pH_roll_std3',
    'DO_delta',      'pH_delta',
    'DO_from_low',   'pH_from_low', 'pH_from_high'
]

# ─── Thresholds ───────────────────────────────────────────────────────────────
DO_LOW  = 5.5;  DO_HIGH  = 7.0
PH_LOW  = 6.5;  PH_HIGH  = 7.5

# ─── Rolling buffer (last 3 readings) for feature engineering ─────────────────
_history = []   # list of (DO, pH) tuples — most recent last

def _update_history(DO_val, pH_val):
    _history.append((DO_val, pH_val))
    if len(_history) > 3:
        _history.pop(0)

def _build_features(DO_val, pH_val, air_pump, acid_pump, base_pump):
    """
    Compute the same 14 engineered features used during model training.
    Uses a rolling 3-point window stored in _history.
    """
    # Build window including current reading
    window_DO = [h[0] for h in _history] + [DO_val]
    window_pH = [h[1] for h in _history] + [pH_val]
    # Keep last 3 only
    window_DO = window_DO[-3:]
    window_pH = window_pH[-3:]

    DO_roll_mean3 = round(float(np.mean(window_DO)), 3)
    pH_roll_mean3 = round(float(np.mean(window_pH)), 3)
    DO_roll_std3  = round(float(np.std(window_DO))  if len(window_DO) > 1 else 0.0, 3)
    pH_roll_std3  = round(float(np.std(window_pH))  if len(window_pH) > 1 else 0.0, 3)

    # Rate of change vs previous reading
    DO_delta = round(DO_val - _history[-1][0], 3) if _history else 0.0
    pH_delta = round(pH_val - _history[-1][1], 3) if _history else 0.0

    # Distance from setpoint
    DO_from_low  = round(DO_val - DO_LOW,  3)
    pH_from_low  = round(pH_val - PH_LOW,  3)
    pH_from_high = round(PH_HIGH - pH_val, 3)

    return pd.DataFrame([{
        'DO':           DO_val,
        'pH':           pH_val,
        'air_pump':     air_pump,
        'acid_pump':    acid_pump,
        'base_pump':    base_pump,
        'DO_roll_mean3': DO_roll_mean3,
        'pH_roll_mean3': pH_roll_mean3,
        'DO_roll_std3':  DO_roll_std3,
        'pH_roll_std3':  pH_roll_std3,
        'DO_delta':      DO_delta,
        'pH_delta':      pH_delta,
        'DO_from_low':   DO_from_low,
        'pH_from_low':   pH_from_low,
        'pH_from_high':  pH_from_high,
    }], columns=FEATURES)

# ─── In-memory log ────────────────────────────────────────────────────────────
prediction_log = []

# ─── Alarm mapping ────────────────────────────────────────────────────────────
ALARM_MAP = {
    0: {"text": "NORMAL",   "color": "#16a34a"},
    1: {"text": "WARNING",  "color": "#d97706"},
    2: {"text": "CRITICAL", "color": "#dc2626"},
}

# ══════════════════════════════════════════════════════════════════════════════
#  POST /predict  — main prediction endpoint
# ══════════════════════════════════════════════════════════════════════════════
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        for field in ['DO', 'pH']:
            if field not in data:
                return jsonify({"error": f"Missing field: {field}"}), 400

        DO_val    = float(data['DO'])
        pH_val    = float(data['pH'])
        air_pump  = int(data.get('air_pump',  1 if DO_val < DO_LOW  else 0))
        acid_pump = int(data.get('acid_pump', 1 if pH_val > PH_HIGH else 0))
        base_pump = int(data.get('base_pump', 1 if pH_val < PH_LOW  else 0))

        # Build full feature vector with rolling history
        X = _build_features(DO_val, pH_val, air_pump, acid_pump, base_pump)

        # Run models
        pred_do    = round(float(np.clip(model_DO.predict(X)[0],    2.0, 9.5)), 3)
        pred_ph    = round(float(np.clip(model_pH.predict(X)[0],    5.0, 9.0)), 3)
        pred_alarm = int(model_alarm.predict(X)[0])

        # Update rolling history AFTER prediction
        _update_history(DO_val, pH_val)

        alarm_info = ALARM_MAP.get(pred_alarm, ALARM_MAP[0])
        timestamp  = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        auto_control = {
            "air_pump":  bool(DO_val < DO_LOW),
            "base_pump": bool(pH_val < PH_LOW),
            "acid_pump": bool(pH_val > PH_HIGH),
        }

        response = {
            "input":        {"DO": DO_val, "pH": pH_val, "air_pump": air_pump,
                             "acid_pump": acid_pump, "base_pump": base_pump},
            "predicted_DO": pred_do,
            "predicted_pH": pred_ph,
            "alarm_label":  pred_alarm,
            "alarm_text":   alarm_info["text"],
            "alarm_color":  alarm_info["color"],
            "auto_control": auto_control,
            "timestamp":    timestamp,
            "features_used": len(FEATURES),
        }

        prediction_log.append(response)
        if len(prediction_log) > 200:
            prediction_log.pop(0)

        print(f"[{timestamp}] DO={DO_val}→{pred_do} | pH={pH_val}→{pred_ph} | {alarm_info['text']}")
        return jsonify(response), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
#  GET /predict?DO=5.8&pH=6.9  — ESP32 convenience endpoint
# ══════════════════════════════════════════════════════════════════════════════
@app.route('/predict', methods=['GET'])
def predict_get():
    try:
        DO_val = float(request.args.get('DO', 6.0))
        pH_val = float(request.args.get('pH', 7.0))
        air_pump  = 1 if DO_val < DO_LOW  else 0
        acid_pump = 1 if pH_val > PH_HIGH else 0
        base_pump = 1 if pH_val < PH_LOW  else 0

        X = _build_features(DO_val, pH_val, air_pump, acid_pump, base_pump)
        pred_do    = round(float(np.clip(model_DO.predict(X)[0],    2.0, 9.5)), 3)
        pred_ph    = round(float(np.clip(model_pH.predict(X)[0],    5.0, 9.0)), 3)
        pred_alarm = int(model_alarm.predict(X)[0])
        _update_history(DO_val, pH_val)

        alarm_info = ALARM_MAP.get(pred_alarm, ALARM_MAP[0])
        return jsonify({
            "DO": DO_val, "pH": pH_val,
            "predicted_DO": pred_do, "predicted_pH": pred_ph,
            "alarm_label":  pred_alarm,
            "alarm_text":   alarm_info["text"],
            "alarm_color":  alarm_info["color"],
            "auto_control": {
                "air_pump":  bool(DO_val < DO_LOW),
                "base_pump": bool(pH_val < PH_LOW),
                "acid_pump": bool(pH_val > PH_HIGH),
            },
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
#  GET /simulate  — generates one simulated sensor reading
# ══════════════════════════════════════════════════════════════════════════════
_sim = {"DO": 6.2, "pH": 7.0}

@app.route('/simulate', methods=['GET'])
def simulate():
    global _sim
    DO_p, pH_p = _sim["DO"], _sim["pH"]
    air  = DO_p < DO_LOW
    base = pH_p < PH_LOW
    acid = pH_p > PH_HIGH

    DO_new = float(np.clip(
        DO_p - np.random.uniform(0.05,0.12) + (np.random.uniform(0.15,0.28) if air else 0) + np.random.normal(0,0.03),
        2.0, 9.5))
    pH_new = float(np.clip(
        pH_p - np.random.uniform(0.03,0.07)
        + (np.random.uniform(0.10,0.18) if base else 0)
        - (np.random.uniform(0.10,0.18) if acid else 0)
        + np.random.normal(0,0.02),
        5.0, 9.0))

    _sim = {"DO": round(DO_new,3), "pH": round(pH_new,3)}
    return jsonify({
        "DO": _sim["DO"], "pH": _sim["pH"],
        "source": "simulated_esp32",
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
#  GET /history  — last N predictions
# ══════════════════════════════════════════════════════════════════════════════
@app.route('/history', methods=['GET'])
def history():
    n = int(request.args.get('n', 60))
    return jsonify(prediction_log[-n:]), 200


# ══════════════════════════════════════════════════════════════════════════════
#  GET /status  — health check
# ══════════════════════════════════════════════════════════════════════════════
@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        "status":   "online",
        "models":   ["model_DO_v2", "model_pH_v2", "model_alarm_v2"],
        "features": FEATURES,
        "version":  "2.0",
        "endpoints": [
            "GET  /          — Dashboard UI",
            "POST /predict   — ML prediction (14 features)",
            "GET  /predict?DO=5.8&pH=6.9 — ESP32 version",
            "GET  /simulate  — Simulated sensor reading",
            "GET  /history   — Last N predictions",
            "GET  /status    — Health check",
        ]
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
#  Serve dashboard
# ══════════════════════════════════════════════════════════════════════════════
@app.route('/')
@app.route('/dashboard')
def dashboard():
    return send_from_directory(BASE_DIR, 'dashboard.html')


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import os
    port = int(os.environ.get("PORT", 5000))   # Render injects PORT automatically
    debug = os.environ.get("FLASK_ENV") != "production"
    print("\n" + "═"*55)
    print("  IIoT Fermenter ML API  (v2 — 14 features)")
    print(f"  Dashboard : http://localhost:{port}/")
    print(f"  Port      : {port}")
    print("═"*55 + "\n")
    app.run(host='0.0.0.0', port=port, debug=debug)
