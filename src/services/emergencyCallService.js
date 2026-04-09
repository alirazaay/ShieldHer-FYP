import RNCallKeep from 'react-native-callkeep';
import logger from '../utils/logger';

const TAG = '[emergencyCallService]';

let initialized = false;
let listenersBound = false;
let onAcceptHandler = null;
let onDeclineHandler = null;
const activeCalls = new Map();

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const next = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return next.toString(16);
  });
}

const callKeepOptions = {
  ios: {
    appName: 'ShieldHer',
    supportsVideo: false,
    maximumCallGroups: '1',
    maximumCallsPerCallGroup: '1',
  },
  android: {
    alertTitle: 'ShieldHer needs phone permissions',
    alertDescription: 'Emergency calls need call permissions to display incoming SOS screens.',
    cancelButton: 'Cancel',
    okButton: 'Allow',
    selfManaged: false,
    additionalPermissions: [],
    foregroundService: {
      channelId: 'shieldher-emergency-calls',
      channelName: 'ShieldHer Emergency Calls',
      notificationTitle: 'ShieldHer call service active',
      notificationIcon: 'ic_launcher',
    },
  },
};

function bindCallKeepListeners() {
  if (listenersBound) {
    return;
  }

  RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
    const payload = activeCalls.get(callUUID) || null;
    activeCalls.delete(callUUID);

    if (payload && onAcceptHandler) {
      onAcceptHandler({ callUUID, payload });
    }

    RNCallKeep.endCall(callUUID);
  });

  RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
    const payload = activeCalls.get(callUUID) || null;
    activeCalls.delete(callUUID);

    if (payload && onDeclineHandler) {
      onDeclineHandler({ callUUID, payload });
    }
  });

  listenersBound = true;
}

export async function initializeEmergencyCallService({ onAccept, onDecline } = {}) {
  if (typeof onAccept === 'function') {
    onAcceptHandler = onAccept;
  }
  if (typeof onDecline === 'function') {
    onDeclineHandler = onDecline;
  }

  if (initialized) {
    return true;
  }

  try {
    await RNCallKeep.setup(callKeepOptions);
    RNCallKeep.setAvailable(true);
    bindCallKeepListeners();
    initialized = true;
    logger.info(TAG, 'CallKeep initialized');
    return true;
  } catch (error) {
    logger.warn(TAG, 'CallKeep initialization failed, using in-app fallback:', error?.message || error);
    return false;
  }
}

export async function showIncomingEmergencyCall(payload) {
  if (!initialized) {
    return { shown: false, reason: 'not-initialized' };
  }

  const callUUID = createUuid();
  const callerName = payload?.userName || 'ShieldHer Emergency';

  try {
    activeCalls.set(callUUID, payload);

    await RNCallKeep.displayIncomingCall(
      callUUID,
      'ShieldHer SOS',
      callerName,
      'generic',
      true
    );

    logger.warn(TAG, 'Incoming emergency call displayed', {
      alertId: payload?.alertId,
      userId: payload?.userId,
    });

    return { shown: true, callUUID };
  } catch (error) {
    activeCalls.delete(callUUID);
    logger.error(TAG, 'Failed to display incoming emergency call:', error);
    return { shown: false, reason: error?.message || 'display-failed' };
  }
}

export function endEmergencyCall(callUUID) {
  if (!callUUID) return;

  try {
    activeCalls.delete(callUUID);
    RNCallKeep.endCall(callUUID);
  } catch (error) {
    logger.warn(TAG, 'endEmergencyCall failed:', error);
  }
}

export function clearAllEmergencyCalls() {
  activeCalls.clear();

  try {
    RNCallKeep.endAllCalls();
  } catch (error) {
    logger.warn(TAG, 'clearAllEmergencyCalls failed:', error);
  }
}

export function isEmergencyCallServiceReady() {
  return initialized;
}
