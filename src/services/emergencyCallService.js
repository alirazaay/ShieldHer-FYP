import RNCallKeep from 'react-native-callkeep';
import { PermissionsAndroid, Platform } from 'react-native';
import logger from '../utils/logger';

const TAG = '[emergencyCallService]';

const ANDROID_CALLKEEP_API_LEVEL = 26;

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
    selfManaged: true,
    additionalPermissions: [],
    foregroundService: {
      channelId: 'shieldher-emergency-calls',
      channelName: 'ShieldHer Emergency Calls',
      notificationTitle: 'ShieldHer call service active',
      notificationIcon: 'ic_launcher',
    },
  },
};

async function ensureAndroidCallKeepPermissions() {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (!PermissionsAndroid?.PERMISSIONS || !PermissionsAndroid?.requestMultiple) {
    return true;
  }

  const requiredPermissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  const optionalPermissions = [];

  if (PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS && Platform.Version >= 33) {
    optionalPermissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }

  const requestedPermissions = [...requiredPermissions, ...optionalPermissions];
  let results = {};

  try {
    results = await PermissionsAndroid.requestMultiple(requestedPermissions);
  } catch (error) {
    logger.warn(TAG, 'Failed requesting call permissions, disabling CallKeep:', error);
    return false;
  }

  const deniedRequired = requiredPermissions.filter(
    (permission) => results[permission] !== PermissionsAndroid.RESULTS.GRANTED
  );

  if (deniedRequired.length > 0) {
    logger.warn(TAG, 'Required call permissions denied, disabling CallKeep:', deniedRequired);
    return false;
  }

  const deniedOptional = optionalPermissions.filter(
    (permission) => results[permission] !== PermissionsAndroid.RESULTS.GRANTED
  );

  if (deniedOptional.length > 0) {
    logger.warn(TAG, 'Optional call permissions denied:', deniedOptional);
  }

  return true;
}

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

  if (Platform.OS === 'android') {
    const supportConnectionService =
      typeof RNCallKeep.supportConnectionService === 'function'
        ? await RNCallKeep.supportConnectionService()
        : true;

    if (!supportConnectionService) {
      logger.warn(TAG, 'ConnectionService unsupported on this device, using in-app fallback');
      return false;
    }

    if (Platform.Version < ANDROID_CALLKEEP_API_LEVEL) {
      logger.warn(TAG, 'Android version does not support self-managed CallKeep, using fallback');
      return false;
    }

    const hasPermissions = await ensureAndroidCallKeepPermissions();
    if (!hasPermissions) {
      return false;
    }
  }

  try {
    await RNCallKeep.setup(callKeepOptions);
    RNCallKeep.setAvailable(true);

    if (Platform.OS === 'android') {
      const enabled =
        typeof RNCallKeep.checkPhoneAccountEnabled === 'function'
          ? await RNCallKeep.checkPhoneAccountEnabled()
          : true;

      if (!enabled) {
        logger.warn(TAG, 'Phone account not enabled yet; continuing with in-app fallback behavior');
      }
    }

    bindCallKeepListeners();
    initialized = true;
    logger.info(TAG, 'CallKeep initialized');
    return true;
  } catch (error) {
    logger.warn(
      TAG,
      'CallKeep initialization failed, using in-app fallback:',
      error?.message || error
    );
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

    await RNCallKeep.displayIncomingCall(callUUID, 'ShieldHer SOS', callerName, 'generic', true);

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
