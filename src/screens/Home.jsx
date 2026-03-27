import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useScreamDetection } from '../hooks/useScreamDetection';

import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

const Home = ({ navigation }) => {

  const [autoSosEnabled, setAutoSosEnabled] = useState(false);

  const handleGetStarted = () => {
    if (navigation?.navigate) {
      navigation.navigate('Login');
    }
  };

  const handleScreamDetected = async (data) => {
    try {
      const user = auth().currentUser;
      if (!user) return;

      await firestore().collection('sos_alerts').add({
        userId: user.uid,
        type: 'auto_scream',
        confidence: data.confidence,
        timestamp: firestore.FieldValue.serverTimestamp(),
        location: null,
        status: 'active',
      });

      console.log('🚨 SOS alert created in Firestore');

    } catch (err) {
      console.error('SOS trigger failed:', err);
    }
  };

  // 🔥 Activate AI scream detection
  useScreamDetection({
    enabled: autoSosEnabled,
    onScreamDetected: handleScreamDetected,
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Top shield icon */}
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="shield-outline" size={40} color="#ffffff" />
          </View>
        </View>

        {/* Brand title */}
        <Text style={styles.title}>ShieldHer</Text>
        <Text style={styles.subtitle}>
          Safety, Intelligence & <Text style={styles.subtitleAccent}>Empowerment.</Text>
        </Text>

        {/* Welcome card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome to ShieldHer</Text>
          <Text style={styles.cardBody}>
            Your AI-powered personal safety companion. Secure, immediate, and connected protection for every woman.
          </Text>
        </View>

        {/* 🚨 Auto SOS Toggle */}
        <View style={styles.toggleContainer}>
          <Text style={styles.toggleText}>AI Auto SOS (Scream Detection)</Text>
          <Switch
            value={autoSosEnabled}
            onValueChange={setAutoSosEnabled}
            trackColor={{ false: "#ccc", true: "#0B26FF" }}
          />
        </View>

        {/* CTA button */}
        <TouchableOpacity activeOpacity={0.9} onPress={handleGetStarted} style={styles.cta}>
          <Text style={styles.ctaText}>
            Start Protecting Today <Text style={styles.ctaArrow}>→</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#E9EAEE',
  },

  container: {
    flexGrow: 1,
    backgroundColor: '#E9EAEE',
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconWrap: {
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },

  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F2CF5',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  title: {
    marginTop: 18,
    fontSize: 32,
    fontWeight: '800',
    color: '#111318',
  },

  subtitle: {
    marginTop: 6,
    fontSize: 13.5,
    color: '#5B6067',
  },

  subtitleAccent: {
    color: '#1E34FF',
    fontWeight: '700',
  },

  card: {
    marginTop: 28,
    width: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 18,
    elevation: 3,
  },

  cardTitle: {
    textAlign: 'center',
    color: '#0B26FF',
    fontSize: 15,
    fontWeight: '800',
  },

  cardBody: {
    marginTop: 10,
    textAlign: 'center',
    color: '#4B5057',
    fontSize: 13.5,
    lineHeight: 20,
  },

  toggleContainer: {
    marginTop: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '85%',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    elevation: 2,
  },

  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },

  cta: {
    marginTop: 40,
    backgroundColor: '#0B26FF',
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 28,
    width: '86%',
    alignItems: 'center',
  },

  ctaText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },

  ctaArrow: {
    color: '#FFFFFF',
  },
});

export default Home;