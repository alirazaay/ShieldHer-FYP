# Scream Model Validation

Use the native debug bridge to validate the shipped `shieldher_yamnet.tflite` against known WAV clips and to compare waveform input modes without changing production UI flows.

## Live Debug Controls

In a dev build, the hook module exposes a global helper:

```js
await ShieldHerScreamDebug.getWaveformDebugConfig();
await ShieldHerScreamDebug.setWaveformInputMode('normalized');
await ShieldHerScreamDebug.setWaveformInputMode('pcm16_float');
await ShieldHerScreamDebug.setWaveformModeComparisonEnabled(true);
```

Live telemetry now logs:

- `waveformMode=...`
- `compareAlt=true|false`
- `altMode=... altRawProb=... altDecisionProb=...` when the alternate mode probe runs

## Offline WAV Validation

1. Push a test clip onto the Android device, for example:

```powershell
adb push .\fixtures\scream.wav /sdcard/Download/scream.wav
```

2. Run the model over that clip from the dev console:

```js
await ShieldHerScreamDebug.setWaveformInputMode('normalized');
await ShieldHerScreamDebug.runDebugWavInference('/sdcard/Download/scream.wav');
```

The returned object includes:

- `windowCount`
- `maxRawProb`, `avgRawProb`
- `maxDecisionProb`, `avgDecisionProb`
- `bestFrameIndex`, `bestFrameStartMs`
- `countZero`, `countLe1Step`, `countLe0_01`, `countGt0_01`
- alternate-mode stats when waveform comparison is available

## Useful Log Filter

```powershell
adb logcat | findstr /I "MODEL OUTPUT MODEL OUTPUT ALT RAW_DIST DEBUG WAV useScreamDetection: telemetry"
```
