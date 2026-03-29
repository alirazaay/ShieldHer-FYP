import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GuardianListItem = ({ guardian, onRemove, loading = false }) => {
  return (
    <View style={styles.container}>
      <View style={styles.guardianInfo}>
        {/* Guardian Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {guardian.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </Text>
        </View>

        {/* Guardian Details */}
        <View style={styles.details}>
          <Text style={styles.guardianName}>{guardian.name}</Text>
          {guardian.relationship && (
            <Text style={styles.relationship}>
              <Text style={styles.label}>Relationship: </Text>
              {guardian.relationship}
            </Text>
          )}
          <View style={styles.contactRow}>
            <MaterialCommunityIcons name="phone" size={12} color="#4B5057" />
            <Text style={styles.contact}>{guardian.phone}</Text>
          </View>
          <View style={styles.contactRow}>
            <MaterialCommunityIcons name="email" size={12} color="#4B5057" />
            <Text style={styles.contact}>{guardian.email}</Text>
          </View>
        </View>
      </View>

      {/* Remove Button */}
      <TouchableOpacity
        onPress={() => onRemove(guardian.id)}
        disabled={loading}
        style={[styles.removeButton, loading && styles.removeButtonDisabled]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons
          name="trash-can-outline"
          size={20}
          color={loading ? '#9AA0A6' : '#EF4444'}
        />
      </TouchableOpacity>
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
  guardianInfo: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4F2CF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  details: {
    flex: 1,
    justifyContent: 'center',
  },
  guardianName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111318',
    marginBottom: 4,
  },
  relationship: {
    fontSize: 12,
    color: '#4B5057',
    marginBottom: 2,
  },
  label: {
    fontWeight: '600',
    color: '#3D3F44',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 1,
  },
  contact: {
    fontSize: 12,
    color: '#4B5057',
  },
  removeButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonDisabled: {
    opacity: 0.5,
  },
});

export default GuardianListItem;
