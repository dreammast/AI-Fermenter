# ESP32 Hardware Integration Guide

This guide walks you through perfectly integrating your ESP32 into your Fermentor project. Since you do not yet have physical DO and pH sensors, this firmware uses a **mathematical Random Walk algorithm** to simulate sensor movement natively on the hardware. 

The ESP32 pushes these simulated values to your Python API (`api_server.py`) and displays the real AI predictions on your OLED screen.

---

## 1. Prerequisites & Setup

### Hardware Needed
*   **ESP32 Development Board**
*   **SSD1306 OLED Display (I2C)** (typically 128x64 or 128x32)
*   Jumper wires

### Software Libraries
Ensure you have installed the following via the **Arduino IDE Library Manager**:
*   `ArduinoJson` by Benoit Blanchon (Version 6.x or 7.x)
*   `Adafruit SSD1306` by Adafruit
*   `Adafruit GFX Library` by Adafruit

### Display Wiring (I2C)
Wire the OLED display directly to your ESP32:
*   **GND** → ESP32 GND
*   **VCC** → ESP32 3V3 (or 5V if your module supports it)
*   **SCL** → ESP32 D22 (Default SCL)
*   **SDA** → ESP32 D21 (Default SDA)

---

## 2. The ESP32 Firmware Code

Copy and paste the following code into your Arduino IDE. 

> [!CAUTION]
> **Important Configuration:**
> 1. You **MUST** change `ssid` and `password` to your actual Wi-Fi credentials.
> 2. You **MUST** change the `serverName` URL to point to the IP address where `api_server.py` is running (e.g., `http://192.168.1.50:5000/predict`).

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// POINT THIS TO YOUR PYTHON API
// Usually http://<YOUR_COMPUTER_LOCAL_IP>:5000/predict
const char* serverName = "http://192.168.1.100:5000/predict"; 

// OLED Setup
#define SCREEN_WIDTH 128 
#define SCREEN_HEIGHT 64 
#define OLED_RESET -1 
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Simulated Sensor Variables (Baseline)
float current_DO = 6.20;
float current_pH = 7.00;

unsigned long lastTime = 0;
// Send data every 3 seconds (matching your dashboard tick rate)
unsigned long timerDelay = 3000;  

// ---------------------------------------------------------
// SETUP
// ---------------------------------------------------------
void setup() {
  Serial.begin(115200);

  // 1. Initialize OLED
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { 
    Serial.println(F("SSD1306 allocation failed. Check wiring."));
    for(;;);
  }
  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);
  display.setCursor(0, 10);
  display.println("Booting System...");
  display.display();

  // 2. Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while(WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    display.print(".");
    display.display();
  }
  
  display.clearDisplay();
  display.setCursor(0, 10);
  display.println("WiFi Connected!");
  display.print("IP: ");
  display.println(WiFi.localIP());
  display.display();
  delay(2000);
}

// ---------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------
void loop() {
  if ((millis() - lastTime) > timerDelay) {
    if(WiFi.status() == WL_CONNECTED){
      
      // 1. SIMULATE PHYSICAL DRIFT (Random Walk)
      // DO goes down slowly, occasionally jumps if "Air" is needed
      current_DO -= (0.02 + random(0, 5) / 100.0);
      if (current_DO < 3.0) current_DO = 8.0; // Reset if too low just for demo

      // pH drift
      current_pH -= (random(-4, 4) / 100.0);

      // Clamp values slightly for realism
      if(current_pH > 8.5) current_pH = 8.5;
      if(current_pH < 5.0) current_pH = 5.0;

      // 2. PREPARE JSON PAYLOAD FOR PYTHON API
      HTTPClient http;
      http.begin(serverName);
      http.addHeader("Content-Type", "application/json");

      String jsonPayload = "{\"DO\": " + String(current_DO, 3) + 
                           ", \"pH\": " + String(current_pH, 3) + "}";
                           
      Serial.println("\n--- Sending Context ---");
      Serial.println(jsonPayload);

      // 3. SEND POST REQUEST
      int httpResponseCode = http.POST(jsonPayload);
      
      if (httpResponseCode > 0) {
        String response = http.getString();
        
        // 4. PARSE AI JSON RESPONSE
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, response);
        
        if (!error) {
          float pred_do = doc["predicted_DO"];
          float pred_ph = doc["predicted_pH"];
          String alarm_text = doc["alarm_text"]; // NORMAL, WARNING, CRITICAL
          
          bool air_pump = doc["auto_control"]["air_pump"];
          
          // Debug to Serial
          Serial.print("AI Alarm: "); Serial.println(alarm_text);
          Serial.print("Air Pump Needed: "); Serial.println(air_pump ? "YES" : "NO");

          // 5. UPDATE PHYSICAL OLED
          display.clearDisplay();
          
          // Output real (simulated) data
          display.setCursor(0, 0);
          display.print(" Live DO : "); display.print(current_DO, 2); display.println(" mg/L");
          display.print(" Live pH : "); display.println(current_pH, 2);
          
          display.drawLine(0, 18, 128, 18, WHITE);
          
          // Output AI Prediction
          display.setCursor(0, 24);
          display.print("AI ALARM: "); 
          display.println(alarm_text);
          
          display.print("Pred DO : "); display.println(pred_do, 2);
          
          // Pump Status
          display.setCursor(0, 52);
          display.print("PUMP (AIR): ");
          display.println(air_pump ? "[ON]" : "[OFF]");
          
          display.display();
          
        } else {
          Serial.print("deserializeJson() failed: ");
          Serial.println(error.c_str());
        }
      } else {
        Serial.print("Error on HTTP request. Code: ");
        Serial.println(httpResponseCode);
        
        // Output offline error to OLED
        display.clearDisplay();
        display.setCursor(0, 20);
        display.println("API OFFLINE / TIMEOUT");
        display.print("Code: "); display.println(httpResponseCode);
        display.display();
      }
      
      http.end(); // Free resources
    } else {
      Serial.println("WiFi Disconnected");
    }
    lastTime = millis();
  }
}
```

## 3. Viewing it all together

1. Keep your Python API (`python api_server.py`) running in the terminal.
2. Open your `dashboard.html` in the Web Browser.
3. Flash the C++ code to the ESP32. Provide it power.
4. Watch the physical OLED screen load data.
5. In your Browser, click the **"Live Cloud (ESP32)"** button we just added. You will immediately see the beautifully styled charts mirroring exactly what the ESP32 is simulating in your hands! 

You now have a genuinely professional edge-to-cloud architecture!
