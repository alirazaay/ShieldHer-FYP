import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { handleAppError } from '../utils/errorHandler';
import { createAlert } from './alertService';
import { getCurrentLocation } from './location';

// Module-level singleton state
let isVoiceActive = false;
let lastTriggerTime = 0;
const COOLDOWN_MS = 60000; // 60 seconds

const EMERGENCY_PHRASES = [
  'help me',
  'emergency help',
  'shield her help',
  'sos help'
];

/**
 * Boots up the continuous native speech recognition pipeline
 * @param {string} userId - Firebase user ID to associate any alerts with
 */
export async function startVoiceListener(userId) {
  if (isVoiceActive) {
    console.log('[voiceSOSService] Listener is already active.');
    return;
  }

  try {
    // 1. Check native Microphone Permissions
    const permStatus = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (permStatus.status !== 'granted') {
      const err = new Error('Microphone access is required for voice SOS detection.');
      // Map to standard error code to leverage Linking.openSettings() in our global handler
      err.code = 'permission-denied';
      throw err;
    }

    // 2. Attach Speech Results Observer
    // The native hook continuously streams interim arrays of recognized text
    ExpoSpeechRecognitionModule.addListener('onSpeechResults', async (event) => {
      const transcripts = event.value || [];
      const text = (transcripts[0] || '').toLowerCase();
      
      const isMatch = EMERGENCY_PHRASES.some(phrase => text.includes(phrase));
      
      if (isMatch) {
         const now = Date.now();
         
         // 3. Enforce Cooldown Limit to prevent API spamming
         if (now - lastTriggerTime > COOLDOWN_MS) { 
            lastTriggerTime = now;
            console.log(`[voiceSOSService] TRIGGER DETECTED: "${text}"`);
            
            try {
              // Extract current hardware GPS coordinates directly to bypass active loop lag
              const loc = await getCurrentLocation();
              if (loc) {
                 await createAlert(userId, loc.latitude, loc.longitude, loc.accuracy);
                 console.log('[voiceSOSService] Voice-triggered SOS successfully dispatched!');
              }
            } catch (alertErr) {
               handleAppError(alertErr, 'Voice SOS Auto-Trigger');
            }
         }
      }
    });

    // 3. Initiate tracking
    await ExpoSpeechRecognitionModule.start({
      language: 'en-US',
      continuous: true,
      interimResults: true, // We need rolling parts of speech immediately
    });
    
    isVoiceActive = true;
    console.log('[voiceSOSService] Voice SOS actively monitoring');
  } catch (err) {
    handleAppError(err, 'Voice SOS Initialization');
  }
}

/**
 * Shut down the active speech module to release system resources
 */
export function stopVoiceListener() {
  if (isVoiceActive) {
    try {
      ExpoSpeechRecognitionModule.stop();
      ExpoSpeechRecognitionModule.removeAllListeners();
      isVoiceActive = false;
      console.log('[voiceSOSService] Voice SOS inactive');
    } catch (err) {
      console.error('[voiceSOSService] Teardown error', err);
    }
  }
}
