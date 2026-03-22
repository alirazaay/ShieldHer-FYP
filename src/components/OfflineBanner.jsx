import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeToNetworkChanges } from '../services/networkService';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsubscribe = subscribeToNetworkChanges((isOnline) => {
      // If we are definitely NOT online, show our offline banner marker
      setIsOffline(!isOnline);
    });
    
    // Cleanup active listener heavily to escape leaks
    return () => unsubscribe();
  }, []);

  // Naturally detach entirely if internet is flowing cleanly
  if (!isOffline) return null;

  return (
    <View style={[
      styles.container,
      { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 20 : 20) }
    ]}>
      <Text style={styles.text}>You're offline. Some features may not work.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EF4444',
    padding: 12,
    paddingBottom: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    // Lock it directly above the routing structure unconditionally
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    elevation: 100,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
});
