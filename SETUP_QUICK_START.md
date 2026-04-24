# 🚀 ESP32 Fermenter - Quick Start Setup

## 📋 Your Current Errors & Fixes

### Error 1: pH Reading `37.61` (Invalid)
**Status**: ✅ FIXED in updated code

Your sensor sends **raw ADC values** (0-4095), not pH (0-14).
New code automatically converts using calibration.

**To verify it works**:
1. Upload updated code
2. Check Serial Monitor output
3. Look for: `[pH] ADC: 3761 → Converted: 7.00 → Smoothed: 7.00`

---

### Error 2: Server Connection Code `-1`
**Status**: ✅ FIXED with diagnostics

New code shows:
- ✓ Backend server test on startup
- ✓ Better error messages
- ✓ Network diagnostics

**To fix**:
1. Verify Python backend is running:
   ```bash
   cd g:\My Drive\FERMENTOR
   python api_server.py
   ```
   Should show: `Running on http://0.0.0.0:5000`

2. Find your computer's actual IP:
   ```bash
   ipconfig
   # Look for "IPv4 Address: 192.168.x.x"
   ```

3. Update code if IP is different:
   ```cpp
   // Line ~18 in esp32_fermenter_updated.cpp
   const char* serverName = "http://192.168.0.121:5000/predict";
   //                            ↑ Change to YOUR IP if needed
   ```

---

## 🔧 pH Sensor Calibration (IMPORTANT!)

Your sensor needs **two-point calibration**.

### Step 1: Get ADC Values from Your Sensor
Replace the temporary calibration values with REAL values from your sensor.

Simple way:
1. Upload code with current calibration
2. Dip pH sensor in a **pH 4.0 buffer solution**
3. Read Serial Monitor: note the **ADC value** (e.g., `ADC: 1024`)
4. Dip in **pH 10.0 buffer solution**
5. Note the **ADC value** (e.g., `ADC: 3072`)

### Step 2: Update Code
```cpp
// Lines 22-25 in esp32_fermenter_updated.cpp
const float PH_CAL_LOW_VALUE = 4.0;      // Don't change
const float PH_CAL_LOW_ADC = 1024.0;     // CHANGE: use your pH 4.0 ADC reading
const float PH_CAL_HIGH_VALUE = 10.0;    // Don't change
const float PH_CAL_HIGH_ADC = 3072.0;    // CHANGE: use your pH 10.0 ADC reading
```

### Step 3: Test
Upload and verify pH readings now match actual solution (4.0 or 10.0).

---

## 📡 Server Connection Steps

### 1. Start Python Backend
```powershell
cd "g:\My Drive\FERMENTOR"
python api_server.py
```

**Expected output**:
```
 * Running on http://127.0.0.1:5000
 * Press CTRL+C to quit
```

### 2. Find Your Computer's IP Address
```powershell
ipconfig
```

Look for:
```
IPv4 Address. . . . . . . . . . . : 192.168.0.121
                                    ↑ This is your IP!
```

### 3. Update ESP32 Code
If your IP is different from `192.168.0.121`:
```cpp
const char* serverName = "http://YOUR_IP_HERE:5000/predict";
```

### 4. Upload & Check Serial Monitor
Look for:
```
[SERVER] Testing connection to backend...
[SERVER] ✓ Backend reachable! (HTTP 200)
```

If you see ✓, you're good!

---

## 🎯 Complete Verification Checklist

### Hardware ✓
- [ ] ESP32 powered via USB
- [ ] pH sensor connected to GPIO 16 (RX) & GPIO 17 (TX)
- [ ] Green LED on GPIO 25
- [ ] Red LED on GPIO 26
- [ ] OLED connected to GPIO 21 (SDA) & GPIO 22 (SCL)

### Software ✓
- [ ] WiFi credentials correct (SSID & password)
- [ ] Server IP matches (check with `ipconfig`)
- [ ] Python backend running on port 5000
- [ ] pH calibration values entered

### Serial Monitor Output ✓
```
[INIT] Starting pH sensor UART (9600 baud)...
[INIT] Configuring LEDs...
[INIT] Starting OLED display...
[WIFI] Connecting to: Mr. Dushyanth
[WIFI] ✓ Connected!
[WIFI] IP Address: 192.168.0.xxx
[SERVER] Testing connection to backend...
[SERVER] ✓ Backend reachable! (HTTP 200)
[SERVER] ✓ Ready! Access at http://192.168.0.xxx

--- Update Cycle ---
[pH] Raw: PH:2048, W: 0, L: 68, T: 30
[pH] ADC: 2048 → Converted: 7.00 → Smoothed: 7.00
[SERVER] Sending: {"DO": 6.20, "pH": 7.00}
[SERVER] HTTP Response Code: 200
[SERVER] ✓ Alarm: NORMAL
[LED] Green ON (pH < 10.0)
--- Cycle Complete ---
```

### Web Dashboard ✓
- [ ] Open `http://192.168.0.XXX/` in browser
- [ ] Shows pH, DO, Status, LED indicators
- [ ] Page refreshes every 3 seconds
- [ ] LED colors match actual LEDs

### OLED Display ✓
- [ ] Shows "FERMENTER" header
- [ ] Shows pH value and status
- [ ] Shows DO value
- [ ] Shows system status
- [ ] Shows pump control status

### LED Behavior ✓
- [ ] Green ON when pH < 10.0 ✓
- [ ] Red ON when pH ≥ 10.0 ✓

---

## 💡 Common Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Wrong IP** | `[SERVER] Failed to connect` | Run `ipconfig`, update `serverName` |
| **Backend not running** | `[SERVER] Backend NOT reachable!` | Run `python api_server.py` |
| **Wrong baud rate** | Gibberish in `[pH] Raw:` | Check pH sensor datasheet, change `begin(9600,` |
| **Calibration wrong** | pH reads `37.61` instead of `7.0` | Calibrate using pH 4.0 & 10.0 buffers |
| **WiFi failing** | `[WIFI] Failed to connect!` | Check SSID/password, check signal strength |
| **OLED not showing** | `[ERROR] OLED initialization failed!` | Check I2C wiring (SDA=21, SCL=22) |

---

## 📞 Still Having Issues?

1. **Read the full guide**: `ARDUINO_TROUBLESHOOTING.md`
2. **Check Serial Monitor**: Look for explicit error messages
3. **Use the test functions**: Upload test code for individual components
4. **Check connections**: All GPIO pins correctly wired
5. **Verify IP addresses**: Match ESP32 and Python backend

---

## 📁 Files Updated

- `esp32_fermenter_updated.cpp` - Complete working code
- `ARDUINO_TROUBLESHOOTING.md` - Detailed troubleshooting guide
- `SETUP_QUICK_START.md` - This guide

## 🔄 Next Steps

1. ✅ Calibrate pH sensor (2-point calibration)
2. ✅ Update IP address if needed
3. ✅ Upload code to ESP32
4. ✅ Start Python backend
5. ✅ Monitor Serial output
6. ✅ Test web dashboard
7. ✅ Verify LED behavior

**Happy fermenting! 🧫**
