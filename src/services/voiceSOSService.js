import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { handleAppError } from '../utils/errorHandler';
import { dispatchSOSAlert } from './alertService';
import { getCurrentLocation } from './location';
import logger from '../utils/logger';

// Configuration constants
const CONFIG = {
  COOLDOWN_MS: 60000, // 60 seconds between triggers
  LANGUAGE: 'en-US',
  EMERGENCY_PHRASES: ['help me', 'emergency help', 'shield her help', 'sos help'],
};

/**
 * VoiceSOSService - Singleton class to manage voice-based SOS detection
 * Uses proper encapsulation to prevent state management issues
 */
class VoiceSOSService {
  constructor() {
    this._isActive = false;
    this._lastTriggerTime = 0;
    this._currentUserId = null;
    this._speechListener = null;
  }

  /**
   * Check if voice listener is currently active
   * @returns {boolean}
   */
  get isActive() {
    return this._isActive;
  }

  /**
   * Get time since last trigger in milliseconds
   * @returns {number}
   */
  get timeSinceLastTrigger() {
    return Date.now() - this._lastTriggerTime;
  }

  /**
   * Check if a phrase matches any emergency trigger phrases
   * @param {string} text - Transcribed speech text
   * @returns {boolean}
   */
  _isEmergencyPhrase(text) {
    const normalizedText = (text || '').toLowerCase();
    return CONFIG.EMERGENCY_PHRASES.some((phrase) => normalizedText.includes(phrase));
  }

  /**
   * Check if cooldown period has elapsed
   * @returns {boolean}
   */
  _canTriggerAlert() {
    return this.timeSinceLastTrigger > CONFIG.COOLDOWN_MS;
  }

  /**
   * Handle speech recognition results
   * @param {Object} event - Speech recognition event with transcripts
   */
  async _handleSpeechResults(event) {
    const transcripts = event.value || [];
    const text = transcripts[0] || '';

    if (!this._isEmergencyPhrase(text)) {
      return;
    }

    if (!this._canTriggerAlert()) {
      logger.debug('[VoiceSOSService]', 'Trigger blocked by cooldown');
      return;
    }

    // Update last trigger time immediately to prevent race conditions
    this._lastTriggerTime = Date.now();
    logger.info('[VoiceSOSService]', `TRIGGER DETECTED: "${text}"`);

    try {
      const location = await getCurrentLocation();
      if (location && this._currentUserId) {
        // Use dispatchSOSAlert for offline-aware SOS with SMS fallback
        const result = await dispatchSOSAlert(this._currentUserId, {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }, {
          triggerType: 'AI',
        });

        if (result.success) {
          logger.info('[VoiceSOSService]', `Voice-triggered SOS dispatched via ${result.method}!`);
        } else {
          logger.error('[VoiceSOSService]', 'Voice SOS failed:', result.error);
        }
      }
    } catch (alertErr) {
      handleAppError(alertErr, 'Voice SOS Auto-Trigger');
    }
  }

  /**
   * Start the voice SOS listener
   * @param {string} userId - Firebase user ID to associate alerts with
   * @returns {Promise<boolean>} - True if started successfully
   */
  async start(userId) {
    if (this._isActive) {
      logger.debug('[VoiceSOSService]', 'Listener is already active.');
      return true;
    }

    if (!userId) {
      logger.error('[VoiceSOSService]', 'User ID is required to start listener');
      return false;
    }

    try {
      // Request microphone permissions
      const permStatus = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (permStatus.status !== 'granted') {
        const err = new Error('Microphone access is required for voice SOS detection.');
        err.code = 'permission-denied';
        throw err;
      }

      // Store user ID for alert creation
      this._currentUserId = userId;

      // Attach speech results observer
      this._speechListener = ExpoSpeechRecognitionModule.addListener('onSpeechResults', (event) =>
        this._handleSpeechResults(event)
      );

      // Start speech recognition
      await ExpoSpeechRecognitionModule.start({
        language: CONFIG.LANGUAGE,
        continuous: true,
        interimResults: true,
      });

      this._isActive = true;
      logger.info('[VoiceSOSService]', 'Voice SOS actively monitoring');
      return true;
    } catch (err) {
      handleAppError(err, 'Voice SOS Initialization');
      return false;
    }
  }

  /**
   * Stop the voice SOS listener and release resources
   */
  stop() {
    if (!this._isActive) {
      return;
    }

    try {
      ExpoSpeechRecognitionModule.stop();
      ExpoSpeechRecognitionModule.removeAllListeners();

      this._isActive = false;
      this._currentUserId = null;
      this._speechListener = null;

      logger.info('[VoiceSOSService]', 'Voice SOS inactive');
    } catch (err) {
      logger.error('[VoiceSOSService]', 'Teardown error', err);
    }
  }

  /**
   * Reset the cooldown timer (useful for testing or manual override)
   */
  resetCooldown() {
    this._lastTriggerTime = 0;
  }
}

// Create singleton instance
const voiceSOSService = new VoiceSOSService();

// Export convenience functions that delegate to singleton
export async function startVoiceListener(userId) {
  return voiceSOSService.start(userId);
}

export function stopVoiceListener() {
  return voiceSOSService.stop();
}

export function isVoiceListenerActive() {
  return voiceSOSService.isActive;
}

// Export the service instance for advanced usage
export default voiceSOSService;
