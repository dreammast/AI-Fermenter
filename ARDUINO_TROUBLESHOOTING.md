# Arduino ESP32 Fermenter - Troubleshooting & Setup Guide

## ❌ Current Issues Detected

### 1. **pH Sensor Reads Invalid Values (37.61, 37.76)**
**Cause**: Your sensor sends raw ADC values (0-4095), not actual pH readings.

**Solution**: The updated code now converts raw ADC to pH using calibration:
```cpp
// In readPH() function - UPDATE THESE VALUES:
float pH_min = 0.0;
float pH_max = 14.0;
float ADC_min = 0.0;      // ADC value at pH 0
float ADC_max = 4095.0;   // ADC value at pH 14
```

### 2. **Server Connection Failed (code: -1)**
**Possible Causes**:
- ❌ Wrong IP address (192.168.0.121)
- ❌ Python backend not running
- ❌ Port 5000 not accessible
- ❌ Network firewall blocking connection
- ❌ WiFi not fully connected

**To Fix**:
1. **Verify backend is running**:
   ```bash
   python api_server.py
   # Should show: "Running on http://0.0.0.0:5000"
   ```

2. **Check IP address**: 
   - On Windows: `ipconfig` → Look for "IPv4 Address"
   - Verify it matches `serverName` in code
   
3. **Test connectivity from ESP32**:
   - Look at Serial Monitor output - new diagnostics will show:
     ```
     [SERVER] Testing connection to backend...
     [SERVER] ✓ Backend reachable! (HTTP 200)
     ```

4. **Update server IP** if needed:
   ```cpp
   const char* serverName = "http://192.168.0.121:5000/predict";
   //                            ↑ Change this to your actual IP
   ```

### 3. **Data Corruption (garbled characters)**
**Cause**: UART baud rate mismatch or poor connection

**Solution**:
- Verify pH sensor baud rate: **9600 baud** (in code)
- Check UART connections:
  - GPIO16 (RX) → pH Sensor TX
  - GPIO17 (TX) → pH Sensor RX
  - GND → GND

---

## 🔧 pH Sensor Calibration

### Step 1: Find Your Sensor's ADC Range
Upload this test code to get raw ADC values:
```cpp
void loop() {
  if (pHSensor.available()) {
    String data = pHSensor.readStringUntil('\n');
    Serial.println(data);  // Log the raw output
  }
  delay(1000);
}
```

Run in two known solutions:
- **pH 4.0 buffer**: Note ADC reading (e.g., `1024`)
- **pH 10.0 buffer**: Note ADC reading (e.g., `3072`)

### Step 2: Update Calibration Values
```cpp
// TWO-POINT CALIBRATION
float pH_at_ADC_low = 4.0;    // pH value at your low ADC reading
float ADC_low = 1024.0;        // Your ADC value at pH 4.0

float pH_at_ADC_high = 10.0;   // pH value at your high ADC reading
float ADC_high = 3072.0;       // Your ADC value at pH 10.0

// Update readPH() with these values
```

### Example Calibration Code
```cpp
float readPH() {
  // ... existing parsing code ...
  
  float rawADC = phValue.toFloat();
  
  // TWO-POINT CALIBRATION (example values - UPDATE THESE!)
  float pH_at_ADC_low = 4.0;
  float ADC_low = 1024.0;
  float pH_at_ADC_high = 10.0;
  float ADC_high = 3072.0;
  
  // Linear interpolation
  float ph = pH_at_ADC_low + (rawADC - ADC_low) * 
             (pH_at_ADC_high - pH_at_ADC_low) / (ADC_high - ADC_low);
  
  // Clamp to valid range
  if (ph < 0) ph = 0;
  if (ph > 14) ph = 14;
  
  current_pH = (0.7 * current_pH) + (0.3 * ph);
  return current_pH;
}
```

---

## 🧪 DO (Dissolved Oxygen) Sensor Setup

The current code **simulates DO**. To use a real sensor:

### Atlas Scientific Gravity Sensor (Generic I2C/UART)
```cpp
// Add to declarations:
float readDO_UART() {
  String doData = "";
  while (doSensor.available()) {
    doData = doSensor.readStringUntil('\n');
  }
  // Parse and return DO value
  return doData.toFloat();
}

// In loop(), replace simulateDO() with:
readDO_UART();
```

### Analog Sensor (0-3.3V)
```cpp
#define DO_ANALOG_PIN 34  // ADC pin
float readDO_Analog() {
  int rawValue = analogRead(DO_ANALOG_PIN);
  float voltage = (rawValue / 4095.0) * 3.3;
  float do_value = (voltage / 3.3) * 10.0;  // Scale 0-10 mg/L
  return do_value;
}
```

---

## 📊 Testing Checklist

- [ ] **Serial Monitor Shows**:
  - `[INIT] Starting pH sensor UART...`
  - `[WIFI] Connected!`
  - `[SERVER] ✓ Backend reachable!`
  - pH values in valid range (0-14)

- [ ] **Web Dashboard**:
  - Access: `http://<ESP32_IP>/`
  - Shows pH, DO, Status, LED status
  - Auto-refreshes every 3 seconds

- [ ] **OLED Display**:
  - Shows "FERMENTER" header
  - pH and DO values
  - System status
  - Pump control status (A, C, B)

- [ ] **LEDs**:
  - Green ON when pH < 10.0
  - Red ON when pH ≥ 10.0

- [ ] **Backend Communication**:
  - Python server running on correct IP:port
  - Check Python logs for incoming requests

---

## 🆘 Emergency Fixes

### Quick Reset
```cpp
// Hold these pins to GND for 2 seconds
// EN (Enable pin) on ESP32
```

### WiFi Not Connecting
```cpp
// In setup(), add:
WiFi.disconnect(true);  // Turn off WiFi
delay(1000);
WiFi.mode(WIFI_STA);
WiFi.begin(ssid, password);
```

### UART Gibberish
```cpp
// Try different baud rates in sequence:
// pHSensor.begin(9600, ...);   // Current
// pHSensor.begin(115200, ...);  // Try this
// pHSensor.begin(4800, ...);    // Or this
```

---

## 📝 Serial Output Log Example

**✓ Working System**:
```
[INIT] Starting pH sensor UART (9600 baud)...
[WIFI] Connecting to: Mr. Dushyanth
[WIFI] ✓ Connected!
[WIFI] IP Address: 192.168.0.100
[SERVER] Testing connection to backend...
[SERVER] ✓ Backend reachable! (HTTP 200)

--- Update Cycle ---
[pH] Raw: PH:2048, W: 0, L: 68, T: 30
[pH] ADC: 2048 → Converted: 7.00 → Smoothed: 7.00
[SERVER] Sending: {"DO": 6.20, "pH": 7.00}
[SERVER] HTTP Response Code: 200
[SERVER] Response: {"alarm_text": "NORMAL", ...}
[LED] Green ON (pH < 10.0)
--- Cycle Complete ---
```

---

## 📞 Still Having Issues?

**Check These First**:
1. ✅ Baud rate match (pH sensor + code)
2. ✅ IP address correct
3. ✅ Backend server running
4. ✅ USB cable connection solid
5. ✅ GPIO pin assignments correct

**Next Steps**:
- Add more `Serial.println()` statements around parsing
- Use oscilloscope to check UART signal (if available)
- Try with test data hardcoded in code
- Check firewall settings on computer running backend
