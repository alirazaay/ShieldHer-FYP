import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GuardianInviteItem = ({ invite, onAccept, onReject, loading = false }) => {
  const getInitials = (name) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isProcessing = loading === invite.id; // Check if this specific invite is being processed

  return (
    <View style={styles.container}>
      <View style={styles.inviteContent}>
        {/* Avatar */}
        <View style={styles.avatar}>
          {invite.userProfileImage ? (
            <Text style={styles.avatarText}>{getInitials(invite.userName)}</Text>
          ) : (
            <Text style={styles.avatarText}>{getInitials(invite.userName)}</Text>
          )}
        </View>

        {/* User Details */}
        <View style={styles.details}>
          <Text style={styles.userName}>{invite.userName}</Text>
          <Text style={styles.contact}>
            <MaterialCommunityIcons name="email" size={12} color="#4B5057" /> {invite.userEmail}
          </Text>
          <Text style={styles.contact}>
            <MaterialCommunityIcons name="phone" size={12} color="#4B5057" /> {invite.userPhone}
          </Text>
          {invite.message && <Text style={styles.message}>&quot;{invite.message}&quot;</Text>}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onAccept(invite.id)}
          disabled={isProcessing}
          style={[styles.acceptButton, isProcessing && styles.buttonDisabled]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialCommunityIcons name="check" size={20} color="#fff" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onReject(invite.id)}
          disabled={isProcessing}
          style={[styles.rejectButton, isProcessing && styles.buttonDisabled]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <MaterialCommunityIcons name="close" size={20} color="#EF4444" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  inviteContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4F2CF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  details: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111318',
    marginBottom: 4,
  },
  contact: {
    fontSize: 12,
    color: '#4B5057',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    color: '#4B5057',
    fontStyle: 'italic',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  rejectButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.41,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default GuardianInviteItem;
