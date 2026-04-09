import { NativeModules, Platform, Vibration } from 'react-native';
import logger from '../utils/logger';

const TAG = '[emergencyAlarmService]';
const VIBRATION_PATTERN = [0, 900, 450, 900];

let alarmActive = false;

function getEmergencyAlarmModule() {
  return NativeModules.EmergencyAlarmModule || null;
}

export async function startEmergencyAlarm(options = {}) {
  if (alarmActive) {
    return true;
  }

  alarmActive = true;

  try {
    const module = getEmergencyAlarmModule();

    if (Platform.OS === 'android' && module?.startAlarm) {
      await module.startAlarm({
        title: options.title || 'ShieldHer Emergency Alert',
        message: options.message || 'Guardian assistance required now.',
      });
    }

    Vibration.vibrate(VIBRATION_PATTERN, true);
    logger.warn(TAG, 'Emergency alarm started');
    return true;
  } catch (error) {
    alarmActive = false;
    logger.error(TAG, 'Failed to start alarm:', error);
    return false;
  }
}

export async function stopEmergencyAlarm() {
  if (!alarmActive) {
    return;
  }

  alarmActive = false;

  try {
    const module = getEmergencyAlarmModule();
    if (Platform.OS === 'android' && module?.stopAlarm) {
      await module.stopAlarm();
    }
  } catch (error) {
    logger.error(TAG, 'Failed stopping native alarm:', error);
  } finally {
    Vibration.cancel();
    logger.info(TAG, 'Emergency alarm stopped');
  }
}

export function isEmergencyAlarmActive() {
  return alarmActive;
}
