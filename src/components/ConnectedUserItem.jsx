import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatLocationTimestamp } from '../services/locationListener';

const ConnectedUserItem = ({ user, userLocation, onViewLocation, loading = false }) => {
  const hasLocation = userLocation?.latitude && userLocation?.longitude;

  return (
    <View style={styles.container}>
      <View style={styles.userInfo}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </Text>
        </View>

        {/* Details */}
        <View style={styles.details}>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.email}>
            <MaterialCommunityIcons name="email" size={12} color="#4B5057" /> {user.email}
          </Text>

          {/* Location Status */}
          {hasLocation ? (
            <View style={styles.locationStatus}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                Last Location: {formatLocationTimestamp(userLocation.timestamp)}
              </Text>
            </View>
          ) : (
            <Text style={styles.noLocation}>
              <MaterialCommunityIcons name="map-search" size={11} color="#9AA0A6" /> Location not
              available
            </Text>
          )}
        </View>
      </View>

      {/* View Location Button */}
      <TouchableOpacity
        onPress={() => onViewLocation(user.id)}
        disabled={loading}
        style={[
          styles.viewButton,
          loading && styles.viewButtonDisabled,
          !hasLocation && styles.viewButtonInactive,
        ]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons
          name="map-marker"
          size={20}
          color={loading ? '#9AA0A6' : '#4F2CF5'}
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
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111318',
    marginBottom: 2,
  },
  email: {
    fontSize: 12,
    color: '#4B5057',
    marginBottom: 4,
  },
  locationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusText: {
    fontSize: 11,
    color: '#4B5057',
    fontWeight: '500',
  },
  noLocation: {
    fontSize: 11,
    color: '#9AA0A6',
    fontStyle: 'italic',
  },
  viewButton: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F0F4FF',
  },
  viewButtonDisabled: {
    opacity: 0.5,
  },
  viewButtonInactive: {
    backgroundColor: '#F3F4F6',
  },
});

export default ConnectedUserItem;
