import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AlertActiveScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="broadcast" size={80} color="#fff" />
        </View>
        <Text style={styles.title}>SOS ACTIVE</Text>
        <Text style={styles.subtitle}>
          Your guardians have been notified of your location.
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.returnButton} 
        onPress={() => navigation.navigate('Dashboard')}
      >
        <Text style={styles.returnButtonText}>Return to Dashboard</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E01111',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  iconContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 16,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 26,
    opacity: 0.9,
  },
  returnButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
  },
  returnButtonText: {
    color: '#E01111',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AlertActiveScreen;
