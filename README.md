 🛡️ ShieldHer – AI-Powered Emergency Safety System

ShieldHer is an **AI-powered women’s safety mobile application** that combines **real-time audio intelligence, emergency SOS automation, and multi-layered offline/online response systems** to provide instant protection in distress situations.

Built using **React Native (Bare Workflow)**, **Native Android Modules**, and **Firebase Cloud Infrastructure**, ShieldHer ensures **continuous safety monitoring even in low-connectivity or offline scenarios**.

---

# 🚀 Key Features

### 🎙️ AI-Based Distress Detection

* On-device **TensorFlow Lite (YAMNet-based model)**
* Real-time microphone monitoring
* Detects distress sounds (e.g., screams, aggression)
* Dual modes:

  * Auto Monitoring Mode
  * Hold-to-Analyze Mode

---

### 🚨 Smart SOS System

* One-tap emergency trigger
* Voice-activated SOS (AI-based)
* Automatic SOS on high-risk detection
* Manual confirmation for moderate risk

---

### 📍 Real-Time Location Tracking

* Live GPS tracking during emergencies
* Guardian notifications with location updates
* Firebase Firestore-based real-time sync

---

### 👨‍👩‍👧 Guardian Alert System

* Instant push notifications (FCM / Expo Push)
* Emergency escalation chain
* Multi-guardian support per user

---

### 📵 Offline Emergency Support

* SMS fallback via native Android module
* Works without internet
* Local queue retry system for failed alerts

---

### 👮 Police Emergency Dashboard

* Dedicated web dashboard for responders
* Live incident monitoring
* Emergency escalation queue (90s rule)
* Location tracking and case management

---

# 🧠 AI Architecture

### 🔬 Model

* **Model Type:** TensorFlow Lite (YAMNet-based)
* **Input:** `float32 [15600]` raw PCM audio (16kHz mono, ~0.975s window)
* **Output:** Single probability score `[0.0 – 1.0]`

### ⚙️ Detection Logic

| Risk Level | Probability | Action           |
| ---------- | ----------- | ---------------- |
| Mild       | 0.75 – 0.84 | Log only         |
| Moderate   | 0.85 – 0.94 | User prompt SOS  |
| High       | 0.95 – 1.00 | Auto SOS trigger |

---

# 🏗️ System Architecture

## 📱 Mobile App (React Native)

* React Native 0.81+ (Bare Workflow)
* Native Android Modules for hardware access
* Hooks-based detection system (`useScreamDetection`)
* Firebase integration for backend sync

---

## 🤖 Native Android Layer

Custom Android modules:

* `ScreamDetectionModule.java` → AI + Audio pipeline
* `ScreamDetectionService.java` → Foreground service (microphone stability)
* `SmsModule.java` → Offline SMS fallback
* `EmergencyAlarmModule.kt` → Alarm + alert system

---

## ☁️ Backend (Firebase)

* Firestore (real-time database)
* Firebase Cloud Functions (alert escalation logic)
* Authentication (user + guardian roles)
* Push notifications (FCM / Expo)

---

## 🖥️ Police Dashboard (Web - React)

* Real-time emergency monitoring
* Live incident map
* Alert escalation system
* Case tracking system

---

# 🔄 System Flow

1. User is monitored via AI audio pipeline
2. Distress detected → probability calculated
3. Action triggered based on risk tier:

   * Log event (mild)
   * Prompt SOS (moderate)
   * Auto SOS (high)
4. SOS event sent to Firebase
5. Cloud Functions:

   * Notify guardians
   * Start escalation timer (90s)
   * Notify police dashboard if unresolved
6. Offline fallback:

   * SMS sent via native module

---

# ⚙️ Tech Stack

### 📱 Mobile

* React Native
* Java / Kotlin (Android Native Modules)
* TensorFlow Lite
* Expo Bare Workflow

### ☁️ Backend

* Firebase Firestore
* Firebase Authentication
* Firebase Cloud Functions
* Firebase Cloud Messaging

### 🖥️ Web Dashboard

* React.js
* Firebase SDK
* Real-time listeners

---

# 📂 Project Structure

```
ShieldHer-FYP/
│
├── android/                  # Native Android modules
│   ├── ScreamDetectionModule.java
│   ├── ScreamDetectionService.java
│   ├── SmsModule.java
│   └── EmergencyAlarmModule.kt
│
├── src/                      # React Native App
│   ├── hooks/
│   │   └── useScreamDetection.js
│   ├── services/
│   │   ├── alertService.js
│   │   ├── harassmentLogger.js
│   │   └── smsService.js
│   ├── screens/
│   └── components/
│
├── PoliceDashboard/          # Web dashboard
│
├── functions/                # Firebase Cloud Functions
│
├── App.js
├── app.config.js
└── package.json
```

---

# 🔐 Permissions Required

* Microphone access (`RECORD_AUDIO`)
* Location access (GPS)
* Internet access
* Background execution (foreground service)

---

# ⚠️ Important Design Notes

* AI inference runs **on-device only** (no cloud ML dependency)
* No audio is stored or transmitted
* System is **privacy-first and offline capable**
* Foreground service ensures continuous monitoring
* Only probability values are emitted to JS layer

---

# 🚧 Known Limitations

* Requires foreground service for full background stability
* Battery usage is moderate due to continuous audio processing
* Accuracy depends on model training quality
* Android background restrictions may vary by OEM

---

# 🎯 Future Improvements

* Better-trained custom distress dataset
* iOS native AI support
* Advanced multi-modal detection (voice + motion)
* Wearable integration (smartwatch SOS trigger)
* Edge TPU optimization for faster inference

---

# 👨‍💻 Author

**Ali Raza**
Final Year Project – Computer Science 

---

# 📌 License

Academic / FYP Use Only (can be extended for production licensing)

---

# ⚡ Summary

ShieldHer is a **full-stack safety intelligence system** combining:

* Real-time AI audio detection
* Native Android emergency execution
* Firebase cloud escalation system
* Police response dashboard
* Offline SMS fallback safety layer
