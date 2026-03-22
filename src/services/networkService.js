import NetInfo from '@react-native-community/netinfo';

/**
 * Subscribes to device network connectivity changes
 * @param {function} callback - Receives a boolean (true if online, false if offline)
 * @returns {function} Unsubscribe function
 */
export const subscribeToNetworkChanges = (callback) => {
  return NetInfo.addEventListener((state) => {
    // Only return true if both connected AND actually reaching the internet
    // Note: isInternetReachable might briefly be null during initialization, default to isConnected
    const isOnline = state.isConnected && state.isInternetReachable !== false;
    callback(isOnline);
  });
};

/**
 * Immediately checks if the device natively sees internet connectivity
 * @returns {Promise<boolean>} TRUE if online
 */
export const isOnline = async () => {
  const state = await NetInfo.fetch();
  return state.isConnected && state.isInternetReachable !== false;
};
