import React from 'react';
import { SafeAreaView, View, Text, StyleSheet } from 'react-native';

const GuardianDashboard = () => {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.title}>Guardian Dashboard</Text>
        <Text style={styles.subtitle}>This is a placeholder. Wire guardian features here.</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#E9EAEE' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '900', color: '#111318', marginBottom: 8 },
  subtitle: { color: '#4B5057' },
});

export default GuardianDashboard;
