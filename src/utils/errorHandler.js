import { Alert, Linking } from 'react-native';
import logger from './logger';

const DEFAULT_ERROR_MESSAGES = {
  'location/permission-denied': 'Location access is required for safety monitoring.',
  'network/offline': 'Please check your internet connection.',
  'permission-denied': 'You do not have permission to access or write this data.',
  'firestore/network-error': 'Network connection failed while saving data. Please try again.',
  'notification/denied': 'Please enable push notifications so you do not miss emergency alerts.',
};

/**
 * Global App Error router resolving obtuse firebase limits to human prompts
 * @param {Error|Object} error Error caught by try/catch
 * @param {string} context Context where the error occurred
 */
export const handleAppError = (error, context) => {
  logger.error('[errorHandler]', `[Error isolated in ${context}]:`, error);

  const errorCode = error?.code || error?.message?.toLowerCase() || 'unknown';

  // 1. Network / Offline Drops
  if (
    errorCode.includes('network') ||
    errorCode.includes('offline') ||
    errorCode.includes('unavailable')
  ) {
    Alert.alert('Network Error', DEFAULT_ERROR_MESSAGES['network/offline']);
    return;
  }

  // 2. iOS/Android Location Restrictions
  if (
    errorCode.includes('location') ||
    errorCode.includes('location/permission-denied') ||
    errorCode.includes('gps')
  ) {
    Alert.alert('Location Required', DEFAULT_ERROR_MESSAGES['location/permission-denied'], [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]);
    return;
  }

  // 3. iOS/Android Push Notifications Restrictions
  if (errorCode.includes('notification')) {
    Alert.alert('Notifications Disabled', DEFAULT_ERROR_MESSAGES['notification/denied'], [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]);
    return;
  }

  // 4. Fallback Default Alerts
  Alert.alert(
    'An Error Occurred',
    error?.message || 'Something went wrong processing your request. Please try again.'
  );
};
