# 📐 ESP32 Fermenter - System Architecture & Wiring

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FERMENTER SYSTEM                          │
└─────────────────────────────────────────────────────────────────┘

                        ┌──────────────┐
                        │   ESP32      │◄───── USB Power/Upload
                        │  Microcontroller
                        │ (Brain)      │
                        └──────┬───────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
    ┌─────────┐         ┌────────────┐         ┌───────────┐
    │  WiFi   │         │   UART2    │         │  I2C Bus  │
    │ Module  │         │ (pH Sensor)│         │(OLED, etc)│
    └────┬────┘         └────┬───────┘         └─────┬─────┘
         │                   │                       │
         ▼                   ▼                       ▼
    ┌──────────────┐  ┌──────────────┐   ┌──────────────────┐
    │   Router     │  │  pH Sensor   │   │  OLED Display    │
    │192.168.0.1  │  │  (UART)      │   │  (128x64)        │
    └──────┬───────┘  └──────────────┘   └──────────────────┘
           │                                        
           ▼                                        
    ┌──────────────────┐                          
    │  Python Backend  │50% ◄────────────────┐ Power Supply
    │  Port: 5000      │                     │ USB Hub (4A+)
    │  ML Processing   │                     │
    └──────┬───────────┘                     │
           │                                │
           ▼                                │
    ┌──────────────────┐                   │
    │   Trained Models │                   │
    │ - DO prediction  │                   │
    │ - pH prediction  │                   │
    │ - Control logic  │                   │
    └──────────────────┘                   │
                                            │
                                    ┌───────┴──────┐
                                    │              │
                                    ▼              ▼
                            ┌──────────────┐  ┌──────────────┐
                            │ Green LED    │  │  Red LED     │
                            │ (GPIO 25)    │  │ (GPIO 26)    │
                            │ pH OK        │  │ pH High      │
                            └──────────────┘  └──────────────┘
```

---

## 🔌 Hardware Wiring Diagram

### ESP32 Pin Configuration

```
ESP32 Development Board (30-pin)

┌─────────────────────────────────────────────┐
│          ESPRESSIF ESP32-WROOM-32           │
│                                             │
│  GND  ─ GND  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  3V3    │
│        ║                          ║        │
│  27  ──╫──────────────────────── 13       │
│  14  ──╫──────────────────────── 12       │
│  26  ──╫─► RED LED────────────── 23       │
│  25  ──╫─► GREEN LED───────────── 5       │
│  33  ───────────────────────────  22 ─┐   │
│  32  ───────────────────────────  21 ─┼─ SDA (OLED)
│  35  ───────────────────────────  GND─┘   │
│  34  ───────────────────────────  19      │
│   4  ────────────────────────────  18     │
│   2  ────────────────────────────  17 ─┐  │
│  15  ───────────────────────────── 16 ─┼─ RX (pH Sensor)
│   8  ───────────────────────────── GND  │  │
│   7  ───────────────────────────── RX0  │  │
│   6  ───────────────────────────── TX0  │  │
│  EN  ────────────────────────────GND    │  │
│                                         │  │
└─────────────────────────────────────────┘  │
                                             │
  SCL (OLED) ──────────────────────────────┘
```

### Detailed Connections

#### 1. **pH Sensor (UART2)**
```
ESP32          FRO      pH Sensor
─────          ───      ──────────
GPIO 16 ◄─────RX  ───────TX
GPIO 17 ──┬───TX  ───────RX
          │
GND  ━━━━━┴──────GND──────GND  (Common ground)
          └─────5V  ───────VCC (if 5V sensor)
```

#### 2. **OLED Display (I2C / Wire)**
```
ESP32          SSD1306 OLED
─────          ──────────────
GPIO 21 ────── SDA
GPIO 22 ────── SCL
GND    ───────GND
3V3    ───────VCC
```

#### 3. **LED Indicators**
```
ESP32                      LED (Active High)
─────                      ──────────────────
GPIO 25 ──┬────── Anode ╌╌ Green LED ╌╌──┐
          │                               │
         [330Ω]                          │
          │                               │
         GND ◄───────────────────────────┘

GPIO 26 ──┬────── Anode ╌╌ Red LED ╌╌───┐
          │                              │
         [330Ω]                         │
          │                              │
         GND ◄──────────────────────────┘
```

#### 4. **WiFi (Built-in)**
```
ESP32 has integrated WiFi
- 2.4GHz antenna on-board
- No external connections needed
- Connect to local WiFi network
```

---

## 🔋 Power Requirements

```
Device                      Current     Voltage
──────────────────────────────────────────────
ESP32                       ~80 mA      3.3V
WiFi (active)               +150 mA     3.3V
pH Sensor                   ~5-10 mA    3.3V or 5V
OLED Display                ~10 mA      3.3V
2x LEDs + Resistors         ~40 mA      3.3V (GPIO)
                            ─────────
Total:                      ~245 mA     from USB

Recommended: USB Power Supply 2A minimum (500mA minimum)
            High-quality USB hub with good power delivery
```

---

## 📊 Data Flow Diagram

```
1. SENSOR DATA ACQUISITION
   ┌──────────────┐
   │ pH Sensor    │
   │ Sends: ADC   │ "PH:2048, W:0, L:68, T:30"
   └───────┬──────┘
           │ UART (9600 baud)
           ▼
   ┌──────────────────────────────┐
   │ ESP32 readPH() Function      │
   │ - Parse raw data             │
   │ - Filter corrupted chars     │
   │ - Calibrate ADC → pH         │ ADC: 2048 → 7.00
   │ - Smooth (exponential)       │ Smoothed: 7.00
   └───────┬──────────────────────┘
           │
           ▼
   current_pH = 7.00

2. DATA TRANSMISSION
   ┌─────────────────────────────┐
   │ JSON Payload Creation       │
   │ {                           │
   │   "pH": 7.00,               │
   │   "DO": 6.20                │
   │ }                           │
   └───────┬─────────────────────┘
           │ HTTP POST
           │ WiFi
           ▼
   ┌────────────────────────────┐
   │ Python Backend             │
   │ http://192.168.0.121:5000  │
   │ /predict endpoint          │
   └───────┬────────────────────┘
           │
           ▼
   ┌────────────────────────────┐
   │ ML Model Prediction        │
   │ - Feature engineering      │
   │ - Alarm classification     │
   │ - Pump control logic       │
   └───────┬────────────────────┘
           │
           ▼
   JSON Response:
   {
     "alarm_text": "NORMAL",
     "auto_control": {
       "air_pump": false,
       "acid_pump": false,
       "base_pump": false
     }
   }

3. RESPONSE PROCESSING & CONTROL
   ┌────────────────────────┐
   │ ESP32 Processes       │
   │ Response              │
   │ - Parse JSON          │
   │ - Update alarm_text   │
   │ - Set pump states     │
   └───────┬────────────────┘
           │
           ├──────────────────────┐
           │                      │
           ▼                      ▼
   ┌──────────────┐      ┌─────────────────────┐
   │ LED Control  │      │ OLED Display Update │
   │              │      │                     │
   │ pH < 10.0    │      │ pH: 7.00 [OK]      │
   │ GREEN ON     │      │ DO: 6.20 mg/L      │
   │              │      │ STATUS: NORMAL     │
   │ pH ≥ 10.0    │      │ A:N C:N B:N        │
   │ RED ON       │      │                     │
   └──────────────┘      └─────────────────────┘
           │
           ▼
   ┌──────────────────────┐
   │ Web Dashboard Update │
   │ http://ESP32_IP/     │
   │ Refresh every 3s     │
   └──────────────────────┘
```

---

## 📍 Network Architecture

```
                    INTERNET
                       │
           ┌───────────┴───────────┐
           │                       │
    ┌──────▼──────┐        ┌──────▼──────┐
    │  Your Home  │        │  Cloud Svc  │
    │  WiFi Router│        │ (Optional)   │
    │192.168.0.1 │        │              │
    └──────┬──────┘        └──────────────┘
           │
           │ 2.4GHz WiFi
           │
    ┌──────┴──────────────────────────────┐
    │        Local Network                 │
    │     192.168.0.0/24                   │
    │                                      │
    │  ┌────────────────┐   ┌───────────┐ │
    │  │  Your Computer │   │   ESP32   │ │
    │  │192.168.0.121  │   │192.168.0.?│ │
    │  │ (Python Backend)   │(Fermenter)│ │
    │  │ :5000         │   │ :80       │ │
    │  └────────┬───────┘   └─────┬─────┘ │
    │           │                 │       │
    │           └────────┬────────┘       │
    │                    │                │
    │   HTTP POST (JSON) │ ←→ Response    │
    │                                      │
    └──────────────────────────────────────┘
```

---

## 🧪 Signal Integrity

### UART Communication (9600 baud)
```
ESP32 RX (GPIO 16)          From pH Sensor
───────────────────────────────────────────
       ┌─┐                 ┌─────────┐
       │1│                 │P│H│:|2│0│4│8│,│
    ───┘ └─────────────────┘ └─────────┘
       1 start bit (0)    8 data bits           1 stop bit (1)
```

### I2C Communication (400kHz standard)
```
ESP32 SDA (GPIO 21)       OLED SDA
——————————────────────────————————
    ┌────────────────┐
    │      ◄──────◄──┤ (Clock control)
    │                │
    │     SCL (GPIO 22)

Master-Slave:
- ESP32 drives SDA & SCL low
- Slave (OLED) acknowledges
- Data transmitted in 8-bit frames
```

---

## ⚠️ Common Wiring Issues

| Issue | Symptom | Fix |
|-------|---------|-----|
| **Reversed UART TX/RX** | Gibberish in Serial | Swap GPIO 16 & 17 connections |
| **Missing GND wire** | Random resets, erratic behavior | Add GND strap to all peripherals |
| **I2C address conflict** | OLED not displaying | Check OLED address (default 0x3C) |
| **5V on 3.3V GPIO** | Damage to ESP32 | Use level shifter/resistor divider |
| **No pull-up resistors** | I2C communication flaky | Add 4.7kΩ pull-ups to SDA/SCL |
| **Long loose wires** | Noise in sensor readings | Use shielded cables, keep short |
| **Wrong pin numbers** | LED/sensors don't work | Double-check pin definitions |

---

## 🔧 Testing Each Component Independently

### 1. Test WiFi Connection
```cpp
void setup() {
  Serial.begin(115200);
  WiFi.begin("SSID", "PASSWORD");
  
  int count = 0;
  while (WiFi.status() != WL_CONNECTED && count < 20) {
    Serial.print(".");
    delay(500);
    count++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi OK!");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi FAILED!");
  }
}
```

### 2. Test pH Sensor UART
```cpp
void setup() {
  Serial.begin(115200);
  pHSensor.begin(9600, SERIAL_8N1, 16, 17);
}

void loop() {
  if (pHSensor.available()) {
    String data = pHSensor.readStringUntil('\n');
    Serial.println("Raw: " + data);
  }
  delay(1000);
}
```

### 3. Test OLED I2C
```cpp
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  Wire.begin(21, 22);
  
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED not found!");
  } else {
    display.println("OLED works!");
    display.display();
  }
}
```

### 4. Test LEDs
```cpp
#define GREEN_LED 25
#define RED_LED 26

void setup() {
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
}

void loop() {
  digitalWrite(GREEN_LED, HIGH);  // Green ON
  delay(1000);
  digitalWrite(GREEN_LED, LOW);
  
  digitalWrite(RED_LED, HIGH);    // Red ON
  delay(1000);
  digitalWrite(RED_LED, LOW);
}
```

---

## 📞 Pin Reference Summary

| Pin | Type | Device | Function |
|-----|------|--------|----------|
| 16 | UART RX | pH Sensor | Receive data |
| 17 | UART TX | pH Sensor | Send commands |
| 21 | I2C SDA | OLED | Data line |
| 22 | I2C SCL | OLED | Clock line |
| 25 | GPIO OUT | Green LED | OK indicator |
| 26 | GPIO OUT | Red LED | Alert indicator |
| GND | Ground | All | Common reference |
| 3V3 | Power | OLED, Sensors | 3.3V supply |

---

*Reference Created: April 24, 2026*
*For ESP32-WROOM-32 with SSD1306 OLED and pH Sensor*
