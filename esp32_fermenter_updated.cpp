#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ========== CONFIGURATION ==========

// -------- WiFi Configuration --------
const char* ssid = "Mr. Dushyanth";
const char* password = "11071005";

// -------- Server Configuration --------
const char* serverName = "http://192.168.0.121:5000/predict";
// ⚠️ IMPORTANT: Update IP address to match your Python backend host!

// -------- pH SENSOR CALIBRATION --------
// Your pH sensor sends raw ADC values (e.g., 37.61 = ADC 3761)
// Convert to pH 0-14 using two-point calibration
// INSTRUCTIONS: See ARDUINO_TROUBLESHOOTING.md for calibration steps

// Method: Linear interpolation between two known points
// Example: At pH 4.0 buffer, ADC = 1024; At pH 10.0 buffer, ADC = 3072
// Update these values based on YOUR sensor calibration!

const float PH_CAL_LOW_VALUE = 4.0;      // pH at low calibration point
const float PH_CAL_LOW_ADC = 0.0;        // ADC reading at pH 4.0 (UPDATE THIS!)
const float PH_CAL_HIGH_VALUE = 10.0;    // pH at high calibration point
const float PH_CAL_HIGH_ADC = 4095.0;    // ADC reading at pH 10.0 (UPDATE THIS!)

// Alternative: Simple linear mapping (0-4095 ADC → 0-14 pH)
// Uncomment to use; comment out the two-point calibration above
/*
const float PH_ADC_MIN = 0.0;      // ADC at pH 0
const float PH_ADC_MAX = 4095.0;   // ADC at pH 14
const float PH_MIN = 0.0;
const float PH_MAX = 14.0;
*/

// -------- OLED Display (128x64) --------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// -------- GPIO Pins --------
#define GREEN_LED 25
#define RED_LED 26
#define PH_RX_PIN 16     // pH sensor RX
#define PH_TX_PIN 17     // pH sensor TX

// -------- UART for pH Sensor --------
HardwareSerial pHSensor(2);  // UART2

// -------- Web Server --------
WebServer server(80);

// ========== GLOBAL VARIABLES ==========

// Sensor readings
float current_pH = 7.0;
float current_DO = 6.2;

// ML Server response
String alarm_text = "NORMAL";
bool auto_air_pump = false;
bool auto_acid_pump = false;
bool auto_base_pump = false;

// LED status
bool green_led_on = false;
bool red_led_on = false;

// Timing
unsigned long lastUpdate = 0;
const int update_interval = 3000;  // 3 seconds between updates

// pH smoothing buffer
const int pH_buffer_size = 5;
float pH_buffer[pH_buffer_size];
int pH_buffer_index = 0;

// ========== pH SENSOR READING ==========

/**
 * Reads raw pH data from UART2 with format: "PH:XXXX, W: X, L: X, T: X"
 * Converts raw ADC value (0-4095) to pH (0-14) using calibration
 * Applies exponential smoothing
 * Returns: smoothed pH value (7.0 default if no valid data)
 */
float readPH() {
  String rawData = "";

  // Read available data from pH sensor (with timeout to avoid blocking)
  unsigned long timeout = millis() + 100;  // 100ms timeout
  while (pHSensor.available() && millis() < timeout) {
    char ch = pHSensor.read();
    
    // Skip corrupted/non-ASCII characters
    if (ch >= 32 && ch <= 126) {  // Printable ASCII
      rawData += ch;
    }
    
    if (ch == '\n') {
      break;
    }
  }

  rawData.trim();

  // Parse the raw data - Format: "PH:XXXX, W: X, L: X, T: X"
  if (rawData.length() > 0) {
    Serial.println("[pH] Raw: " + rawData);

    // Look for "PH:" pattern
    int phIndex = rawData.indexOf("PH:");
    if (phIndex != -1) {
      int commaIndex = rawData.indexOf(",", phIndex);
      if (commaIndex == -1) {
        commaIndex = rawData.length();
      }

      // Extract raw ADC value
      String phValue = rawData.substring(phIndex + 3, commaIndex);
      phValue.trim();

      float rawADC = phValue.toFloat();

      // Calibration: Convert raw sensor value to pH (0-14)
      // Using two-point linear calibration method
      float ph = PH_CAL_LOW_VALUE + (rawADC - PH_CAL_LOW_ADC) * 
                 (PH_CAL_HIGH_VALUE - PH_CAL_LOW_VALUE) / 
                 (PH_CAL_HIGH_ADC - PH_CAL_LOW_ADC);

      // Ensure pH is within valid range
      if (ph < 0) ph = 0;
      if (ph > 14) ph = 14;

      // Apply exponential smoothing
      current_pH = (0.7 * current_pH) + (0.3 * ph);
      Serial.println("[pH] ADC: " + String((int)rawADC) + " → Converted: " + String(ph, 2) + " → Smoothed: " + String(current_pH, 2));
      return current_pH;
    } else {
      Serial.println("[pH] Parse error: No PH: pattern found");
    }
  }

  return current_pH;
}

// ========== DO SENSOR READING ==========

/**
 * Simulates DO (dissolved oxygen) reading
 * TODO: Replace with actual DO sensor code (analog/SPI/I2C)
 * Real sensors: Atlas Scientific, YSI, Hach, etc.
 */
float simulateDO() {
  // Simulate gradual DO decrease with random variation
  current_DO -= (0.02 + random(0, 5) / 100.0);
  
  // Reset if too low
  if (current_DO < 3.0) {
    current_DO = 8.0;
  }
  
  return current_DO;
}

// ========== SERVER COMMUNICATION ==========

/**
 * Sends sensor data to ML backend and receives control commands
 * Payload: {"DO": X.XX, "pH": Y.YY}
 * Response: {"alarm_text": "...", "auto_control": {"air_pump": bool, "acid_pump": bool, "base_pump": bool}}
 */
void sendToMLServer() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[SERVER] WiFi disconnected! Status: " + String(WiFi.status()));
    alarm_text = "NO_WIFI";
    return;
  }

  Serial.println("[SERVER] WiFi OK, attempting connection to: " + String(serverName));
  
  HTTPClient http;
  http.setConnectTimeout(5000);  // 5 second timeout
  http.setTimeout(5000);
  
  if (!http.begin(serverName)) {
    Serial.println("[SERVER] Failed to begin HTTP connection!");
    alarm_text = "HTTP_INIT_ERROR";
    return;
  }

  http.addHeader("Content-Type", "application/json");

  // Build JSON payload
  String payload = "{\"DO\": " + String(current_DO, 2) +
                   ", \"pH\": " + String(current_pH, 2) + "}";

  Serial.println("[SERVER] Sending: " + payload);

  int httpResponseCode = http.POST(payload);

  Serial.println("[SERVER] HTTP Response Code: " + String(httpResponseCode));

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("[SERVER] Response: " + response);

    // Parse JSON response
    DynamicJsonDocument doc(512);
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      alarm_text = doc["alarm_text"].as<String>();
      auto_air_pump = doc["auto_control"]["air_pump"] | false;
      auto_acid_pump = doc["auto_control"]["acid_pump"] | false;
      auto_base_pump = doc["auto_control"]["base_pump"] | false;

      Serial.println("[SERVER] ✓ Alarm: " + alarm_text);
      Serial.println("[SERVER] ✓ Air Pump: " + String(auto_air_pump ? "ON" : "OFF"));
    } else {
      Serial.println("[SERVER] JSON parse error: " + String(error.c_str()));
      alarm_text = "JSON_ERROR";
    }
  } else {
    Serial.println("[SERVER] ✗ Connection failed (code: " + String(httpResponseCode) + ")");
    Serial.println("[SERVER] Possible issues:");
    Serial.println("  - Check IP address: 192.168.0.121");
    Serial.println("  - Check port: 5000");
    Serial.println("  - Check if Python backend is running");
    Serial.println("  - Check network connectivity");
    alarm_text = "SERVER_ERROR";
  }

  http.end();
}

// ========== LED CONTROL ==========

/**
 * Controls LED indicators based on pH level
 * pH < 10.0: Green LED ON (healthy range)
 * pH ≥ 10.0: Red LED ON (high pH alert)
 */
void updateLEDs() {
  bool should_green = (current_pH < 10.0);
  bool should_red = (current_pH >= 10.0);

  // Update GREEN LED
  if (should_green && !green_led_on) {
    digitalWrite(GREEN_LED, HIGH);
    green_led_on = true;
    Serial.println("[LED] Green ON (pH < 10.0)");
  } else if (!should_green && green_led_on) {
    digitalWrite(GREEN_LED, LOW);
    green_led_on = false;
    Serial.println("[LED] Green OFF");
  }

  // Update RED LED
  if (should_red && !red_led_on) {
    digitalWrite(RED_LED, HIGH);
    red_led_on = true;
    Serial.println("[LED] Red ON (pH ≥ 10.0)");
  } else if (!should_red && red_led_on) {
    digitalWrite(RED_LED, LOW);
    red_led_on = false;
    Serial.println("[LED] Red OFF");
  }
}

// ========== OLED DISPLAY ==========

/**
 * Updates OLED display with real-time sensor data and status
 */
void updateDisplay() {
  display.clearDisplay();

  // Header
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("FERMENTER");

  // Header separator
  display.drawLine(0, 20, 128, 20, SSD1306_WHITE);

  // Sensor values
  display.setTextSize(1);
  display.setCursor(0, 25);
  
  display.print("pH: ");
  display.print(current_pH, 2);
  display.println(current_pH < 10.0 ? " [OK]" : " [HIGH]");

  display.print("DO: ");
  display.print(current_DO, 2);
  display.println(" mg/L");

  // Alarm status
  display.setCursor(0, 42);
  display.print("STATUS: ");
  display.println(alarm_text);

  // Auto control status
  display.setCursor(0, 55);
  display.print("A:");
  display.print(auto_air_pump ? "Y " : "N ");
  display.print("C:");
  display.print(auto_acid_pump ? "Y " : "N ");
  display.print("B:");
  display.println(auto_base_pump ? "Y" : "N");

  display.display();
}

// ========== WEB DASHBOARD ==========

/**
 * Generates HTML dashboard for web interface
 * Accessible at: http://<ESP32_IP>/
 */
String getHTMLDashboard() {
  String html = R"rawliteral(
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>IIoT Fermenter Dashboard</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: 'Segoe UI', Tahoma, Geneva, sans-serif;
        background: #0f172a; 
        color: #f1f5f9;
        padding: 20px;
      }
      .container { max-width: 600px; margin: 0 auto; }
      h1 { 
        text-align: center; 
        color: #38bdf8; 
        margin-bottom: 30px;
        font-size: 2.5rem;
      }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .card { 
        background: #1e293b;
        padding: 25px;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        border-left: 4px solid #38bdf8;
        transition: transform 0.2s;
      }
      .card:hover { transform: translateY(-2px); }
      .card h2 { 
        font-size: 0.9rem;
        text-transform: uppercase;
        color: #94a3b8;
        margin-bottom: 10px;
        letter-spacing: 1px;
      }
      .value { 
        font-size: 2.8rem;
        font-weight: 700;
        color: #38bdf8;
        margin: 10px 0;
      }
      .unit { font-size: 0.9rem; color: #64748b; }
      .status { 
        background: #0f766e;
        padding: 15px;
        border-radius: 8px;
        margin-top: 10px;
        text-align: center;
        font-weight: 600;
      }
      .pH-ok { border-left-color: #10b981; }
      .pH-high { border-left-color: #ef4444; }
      .led-indicator {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 8px;
        animation: pulse 2s infinite;
      }
      .led-green { background: #10b981; }
      .led-red { background: #ef4444; }
      .timestamp { 
        text-align: center;
        color: #64748b;
        font-size: 0.85rem;
        margin-top: 20px;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🧫 Fermenter</h1>
      
      <div class="grid">
        <div class="card )rawliteral";

  html += (current_pH < 10.0) ? "pH-ok" : "pH-high";
  
  html += R"rawliteral(">
          <h2>pH Level</h2>
          <div class="value">)rawliteral";
  
  html += String(current_pH, 2);
  
  html += R"rawliteral(</div>
          <div class="unit">)rawliteral";
  html += (current_pH < 10.0) ? "✓ Normal Range" : "⚠ High pH Alert";
  html += R"rawliteral(</div>
        </div>

        <div class="card">
          <h2>Dissolved Oxygen</h2>
          <div class="value">)rawliteral";
  
  html += String(current_DO, 2);
  
  html += R"rawliteral(</div>
          <div class="unit">mg/L</div>
        </div>

        <div class="card">
          <h2>System Status</h2>
          <div class="value" style="font-size: 1.5rem;">)rawliteral";
  
  html += alarm_text;
  
  html += R"rawliteral(</div>
          <div class="status">)rawliteral";
  html += (alarm_text == "NORMAL") ? "✓ Operating Normally" : "⚠ Check System";
  html += R"rawliteral(</div>
        </div>

        <div class="card">
          <h2>LED Status</h2>
          <div style="margin-top: 15px; line-height: 1.8;">
            <div><span class="led-indicator )rawliteral";
  html += green_led_on ? "led-green" : "";
  html += R"rawliteral("></span>Green: )rawliteral";
  html += green_led_on ? "ON" : "OFF";
  html += R"rawliteral(</div>
            <div><span class="led-indicator )rawliteral";
  html += red_led_on ? "led-red" : "";
  html += R"rawliteral("></span>Red: )rawliteral";
  html += red_led_on ? "ON" : "OFF";
  html += R"rawliteral(</div>
          </div>
        </div>
      </div>

      <div class="timestamp">Last update: Auto-refresh every 3 seconds</div>
    </div>

    <script>
      // Auto-refresh every 3 seconds
      setTimeout(() => { location.reload(); }, 3000);
    </script>
  </body>
  </html>
  )rawliteral";

  return html;
}

// ========== WEB SERVER ROUTES ==========

void handleRoot() {
  server.send(200, "text/html", getHTMLDashboard());
}

void handleJSON() {
  DynamicJsonDocument doc(256);
  doc["pH"] = current_pH;
  doc["DO"] = current_DO;
  doc["alarm"] = alarm_text;
  doc["air_pump"] = auto_air_pump;
  doc["acid_pump"] = auto_acid_pump;
  doc["base_pump"] = auto_base_pump;
  doc["green_led"] = green_led_on;
  doc["red_led"] = red_led_on;

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// ========== SETUP ==========

void setup() {
  // Serial Monitor for debugging
  Serial.begin(115200);
  delay(500);
  
  Serial.println("\n\n=== ESP32 Fermenter Control System ===");
  Serial.println("Initializing...\n");

  // ---- Initialize pH Sensor UART ----
  Serial.println("[INIT] Starting pH sensor UART (9600 baud)...");
  pHSensor.begin(9600, SERIAL_8N1, PH_RX_PIN, PH_TX_PIN);
  
  // ---- Initialize LEDs ----
  Serial.println("[INIT] Configuring LEDs...");
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);

  // ---- Initialize OLED Display ----
  Serial.println("[INIT] Starting OLED display...");
  Wire.begin(21, 22);  // SDA=21, SCL=22
  
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[ERROR] OLED initialization failed!");
    while (1);
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Fermenter Control");
  display.println("Connecting WiFi...");
  display.display();

  // ---- Connect to WiFi ----
  Serial.println("[WIFI] Connecting to: " + String(ssid));
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] ✓ Connected!");
    Serial.print("[WIFI] IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WIFI] RSSI (signal strength): ");
    Serial.println(WiFi.RSSI());
    
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("WiFi Connected!");
    display.print("IP: ");
    display.println(WiFi.localIP());
    display.display();
    
    // ---- Test Backend Server Connection ----
    Serial.println("\n[SERVER] Testing connection to backend...");
    Serial.println("[SERVER] Target: " + String(serverName));
    
    HTTPClient testHttp;
    testHttp.setConnectTimeout(5000);
    testHttp.setTimeout(5000);
    
    if (testHttp.begin(serverName)) {
      testHttp.addHeader("Content-Type", "application/json");
      String testPayload = "{\"test\": true}";
      int testCode = testHttp.POST(testPayload);
      
      if (testCode > 0) {
        Serial.println("[SERVER] ✓ Backend reachable! (HTTP " + String(testCode) + ")");
        display.println("Backend OK");
      } else {
        Serial.println("[SERVER] ✗ Backend NOT reachable! (code: " + String(testCode) + ")");
        display.println("Backend FAIL");
      }
      testHttp.end();
    } else {
      Serial.println("[SERVER] ✗ Failed to initialize HTTP!");
      display.println("HTTP FAIL");
    }
    display.display();
    
  } else {
    Serial.println("\n[WIFI] ✗ Failed to connect!");
    Serial.println("[WIFI] Possible issues:");
    Serial.println("  - Check SSID: " + String(ssid));
    Serial.println("  - Check PASSWORD");
    Serial.println("  - Check WiFi signal strength");
    
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("WiFi Failed!");
    display.println("Check credentials");
    display.display();
  }

  // ---- Initialize Web Server ----
  Serial.println("\n[SERVER] Starting web server on port 80...");
  server.on("/", handleRoot);
  server.on("/data.json", handleJSON);
  server.begin();
  Serial.println("[SERVER] ✓ Ready! Access at http://" + WiFi.localIP().toString());

  delay(2000);
}

// ========== MAIN LOOP ==========

void loop() {
  // Handle web server requests
  server.handleClient();

  // Update cycle every 3 seconds
  if (millis() - lastUpdate > update_interval) {
    lastUpdate = millis();

    Serial.println("\n--- Update Cycle ---");

    // 1. Read sensors
    readPH();
    simulateDO();  // TODO: Replace with real DO sensor code

    // 2. Send data to ML server and get predictions
    sendToMLServer();

    // 3. Update LED indicators (pH-based logic)
    updateLEDs();

    // 4. Update OLED display
    updateDisplay();

    Serial.println("--- Cycle Complete ---\n");
  }
}
