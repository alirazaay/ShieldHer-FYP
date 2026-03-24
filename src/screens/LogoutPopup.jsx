import React from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';

// A presentational popup screen to match the provided design precisely.
// Exposes onCancel and onConfirm callbacks; if used as a full screen, the gray
// backdrop is the page background. You can also embed this card inside a modal.
const LogoutPopup = ({ navigation, onCancel, onConfirm, asModal = false }) => {
  const handleCancel = () => {
    if (onCancel) onCancel();
    else if (navigation?.goBack) navigation.goBack();
  };
  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    // Example: navigate to Login or root
    else if (navigation?.navigate) navigation.navigate('Login');
  };

  if (asModal) {
    // Render only the card body; parent provides the backdrop/modal container
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Confirm Logout</Text>
        <Text style={styles.message}>Are you sure you want to log out{"\n"}of your ShieldHer session?</Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity activeOpacity={0.9} onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.9} onPress={handleConfirm} style={styles.confirmBtn}>
            <Text style={styles.confirmText}>YES, Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>Confirm Logout</Text>
          <Text style={styles.message}>Are you sure you want to log out{"\n"}of your ShieldHer session?</Text>

          <View style={styles.actionsRow}>
            <TouchableOpacity activeOpacity={0.9} onPress={handleCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} onPress={handleConfirm} style={styles.confirmBtn}>
              <Text style={styles.confirmText}>YES, Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#CFCFD1' },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  card: {
    width: '82%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111318',
    marginBottom: 14,
  },
  message: {
    fontSize: 13.5,
    color: '#3D3F44',
    lineHeight: 20,
    marginBottom: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelBtn: {
    backgroundColor: '#9C9797',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  cancelText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  confirmBtn: {
    backgroundColor: '#3A2BF1',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});

export default LogoutPopup;
