import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../config/firebase';
import FormInput from '../components/FormInput';
import PrimaryButton from '../components/PrimaryButton';
import {
  fetchUserProfile,
  fetchGuardians,
  updateUserProfile,
  addGuardian,
  removeGuardian,
  getErrorMessage,
} from '../services/profile';
import { signOutUser } from '../services/auth';
import GuardianListItem from '../components/GuardianListItem';
import { sendGuardianInvite, getInviteErrorMessage } from '../services/guardianInvites';

const ProfileScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  // User Profile State
  const [userProfile, setUserProfile] = useState({
    fullName: '',
    phone: '',
    email: '',
    emergencyPhone: '',
    emergencyEmail: '',
    role: 'user',
    profileImage: null,
  });

  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState({
    fullName: '',
    phone: '',
    email: '',
    emergencyPhone: '',
    emergencyEmail: '',
  });

  // Guardians Data
  const [guardians, setGuardians] = useState([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardianLoading, setGuardianLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddGuardianModal, setShowAddGuardianModal] = useState(false);
  const [newGuardian, setNewGuardian] = useState({
    name: '',
    phone: '',
    email: '',
    relationship: '',
  });
  const [addingGuardian, setAddingGuardian] = useState(false);
  const [showInviteGuardianModal, setShowInviteGuardianModal] = useState(false);
  const [inviteGuardianData, setInviteGuardianData] = useState({
    guardianEmail: '',
    message: '',
  });
  const [sendingInvite, setSendingInvite] = useState(false);

  // Load user profile and guardians on mount
  useEffect(() => {
    loadProfileData();
  }, []);

  // Auto-dismiss error messages after 4 seconds
  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  // Sync unsavedChanges when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      setUnsavedChanges({
        fullName: userProfile.fullName,
        phone: userProfile.phone,
        email: userProfile.email,
        emergencyPhone: userProfile.emergencyPhone,
        emergencyEmail: userProfile.emergencyEmail,
      });
    }
  }, [isEditMode]);

  const loadProfileData = async () => {
    try {
      setLoading(true);
      const currentUser = auth.currentUser;

      if (!currentUser) {
        navigation?.replace('Login');
        return;
      }

      // Fetch user profile
      const profile = await fetchUserProfile(currentUser.uid);
      setUserProfile(profile);

      // Fetch guardians only if user role is 'user'
      if (profile.role === 'user') {
        const guardiansData = await fetchGuardians(currentUser.uid);
        setGuardians(guardiansData);
      }

      setError(null);
    } catch (err) {
      console.error('[ProfileScreen] loadProfileData error:', err);
      setError({
        message: getErrorMessage(err),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      // Validation
      if (!unsavedChanges.fullName?.trim()) {
        setError({ message: 'Full name is required', type: 'error' });
        return;
      }
      if (!unsavedChanges.phone?.trim()) {
        setError({ message: 'Phone number is required', type: 'error' });
        return;
      }
      if (!unsavedChanges.email?.trim()) {
        setError({ message: 'Email is required', type: 'error' });
        return;
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(unsavedChanges.email)) {
        setError({ message: 'Invalid email address', type: 'error' });
        return;
      }

      // Phone validation
      if (unsavedChanges.phone.length < 10) {
        setError({ message: 'Phone number must be at least 10 digits', type: 'error' });
        return;
      }

      // Check if user role is 'user' and emergency contact fields are required
      if (userProfile.role === 'user') {
        if (!unsavedChanges.emergencyPhone?.trim()) {
          setError({ message: 'Emergency contact phone is required', type: 'error' });
          return;
        }
        if (!unsavedChanges.emergencyEmail?.trim()) {
          setError({ message: 'Emergency contact email is required', type: 'error' });
          return;
        }

        // Validate emergency email
        if (!emailRegex.test(unsavedChanges.emergencyEmail)) {
          setError({ message: 'Invalid emergency contact email', type: 'error' });
          return;
        }

        // Validate emergency phone
        if (unsavedChanges.emergencyPhone.length < 10) {
          setError({
            message: 'Emergency phone must be at least 10 digits',
            type: 'error',
          });
          return;
        }
      }

      setSaving(true);
      const currentUser = auth.currentUser;

      if (!currentUser) {
        navigation?.replace('Login');
        return;
      }

      // Update profile
      await updateUserProfile(currentUser.uid, unsavedChanges);

      // Update local state
      setUserProfile((prev) => ({
        ...prev,
        ...unsavedChanges,
      }));

      setIsEditMode(false);
      setError({
        message: 'Profile updated successfully',
        type: 'success',
      });
    } catch (err) {
      console.error('[ProfileScreen] handleSaveProfile error:', err);
      setError({
        message: getErrorMessage(err),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddGuardian = async () => {
    try {
      // Validation
      if (!newGuardian.name?.trim()) {
        setError({ message: 'Guardian name is required', type: 'error' });
        return;
      }
      if (!newGuardian.phone?.trim()) {
        setError({ message: 'Guardian phone is required', type: 'error' });
        return;
      }
      if (!newGuardian.email?.trim()) {
        setError({ message: 'Guardian email is required', type: 'error' });
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newGuardian.email)) {
        setError({ message: 'Invalid email address', type: 'error' });
        return;
      }

      if (newGuardian.phone.length < 10) {
        setError({ message: 'Phone number must be at least 10 digits', type: 'error' });
        return;
      }

      setAddingGuardian(true);
      const currentUser = auth.currentUser;

      if (!currentUser) {
        navigation?.replace('Login');
        return;
      }

      // Add guardian
      await addGuardian(currentUser.uid, newGuardian);

      // Refresh guardians list
      const updatedGuardians = await fetchGuardians(currentUser.uid);
      setGuardians(updatedGuardians);

      // Reset form and close modal
      setNewGuardian({
        name: '',
        phone: '',
        email: '',
        relationship: '',
      });
      setShowAddGuardianModal(false);

      setError({
        message: 'Guardian added successfully',
        type: 'success',
      });
    } catch (err) {
      console.error('[ProfileScreen] handleAddGuardian error:', err);
      setError({
        message: getErrorMessage(err),
        type: 'error',
      });
    } finally {
      setAddingGuardian(false);
    }
  };

  const handleRemoveGuardian = async (guardianId) => {
    try {
      Alert.alert('Remove Guardian', 'Are you sure you want to remove this guardian?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setGuardianLoading(true);
              const currentUser = auth.currentUser;

              if (!currentUser) {
                navigation?.replace('Login');
                return;
              }

              // Remove guardian
              await removeGuardian(currentUser.uid, guardianId);

              // Update local state
              setGuardians((prev) => prev.filter((g) => g.id !== guardianId));

              setError({
                message: 'Guardian removed successfully',
                type: 'success',
              });
            } catch (err) {
              console.error('[ProfileScreen] handleRemoveGuardian error:', err);
              setError({
                message: getErrorMessage(err),
                type: 'error',
              });
            } finally {
              setGuardianLoading(false);
            }
          },
        },
      ]);
    } catch (err) {
      console.error('[ProfileScreen] handleRemoveGuardian error:', err);
      setError({
        message: getErrorMessage(err),
        type: 'error',
      });
    }
  };

  const handleSendGuardianInvite = async () => {
    try {
      // Validation
      if (!inviteGuardianData.guardianEmail?.trim()) {
        setError({ message: 'Guardian email is required', type: 'error' });
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inviteGuardianData.guardianEmail)) {
        setError({ message: 'Invalid email address', type: 'error' });
        return;
      }

      setSendingInvite(true);
      const currentUser = auth.currentUser;

      if (!currentUser) {
        navigation?.replace('Login');
        return;
      }

      // Send invite
      await sendGuardianInvite({
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userName: userProfile.fullName,
        userPhone: userProfile.phone,
        guardianEmail: inviteGuardianData.guardianEmail.trim(),
        userProfileImage: userProfile.profileImage || null,
        message: inviteGuardianData.message.trim(),
      });

      // Reset form and close modal
      setInviteGuardianData({
        guardianEmail: '',
        message: '',
      });
      setShowInviteGuardianModal(false);

      setError({
        message: 'Invite sent successfully!',
        type: 'success',
      });
    } catch (err) {
      console.error('[ProfileScreen] handleSendGuardianInvite error:', err);
      setError({
        message: getInviteErrorMessage(err),
        type: 'error',
      });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleLogout = async () => {
    try {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOutUser();
              navigation?.replace('Login');
            } catch (err) {
              console.error('[ProfileScreen] handleLogout error:', err);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]);
    } catch (err) {
      console.error('[ProfileScreen] handleLogout error:', err);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#4F2CF5" style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.profileContent}>
          {/* Profile Picture */}
          <View style={styles.profileImageCircle}>
            <Text style={styles.profileInitials}>
              {userProfile.fullName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </Text>
          </View>

          {/* Profile Info */}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{userProfile.fullName}</Text>
            <Text style={styles.profileRole}>
              {userProfile.role === 'user' ? 'User' : 'Guardian'}
            </Text>
          </View>
        </View>

        {/* Edit Button */}
        {!isEditMode && (
          <TouchableOpacity
            onPress={() => setIsEditMode(true)}
            style={styles.editButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Error Message Toast */}
      {error && (
        <View
          style={[
            styles.messageContainer,
            error.type === 'success' ? styles.messageSuccess : styles.messageError,
          ]}
        >
          {error.type === 'success' && (
            <MaterialCommunityIcons
              name="check-circle"
              size={20}
              color="#10B981"
              style={styles.messageIcon}
            />
          )}
          {error.type === 'error' && (
            <MaterialCommunityIcons
              name="alert-circle"
              size={20}
              color="#EF4444"
              style={styles.messageIcon}
            />
          )}
          <Text
            style={[
              styles.messageText,
              error.type === 'success' ? styles.messageTextSuccess : styles.messageTextError,
            ]}
          >
            {error.message}
          </Text>
          <TouchableOpacity onPress={() => setError(null)} style={styles.messageClose}>
            <MaterialCommunityIcons name="close" size={16} color="currentColor" />
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      >
        {/* Personal Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          {isEditMode ? (
            <>
              <FormInput
                label="Full Name"
                value={unsavedChanges.fullName}
                onChangeText={(text) =>
                  setUnsavedChanges({ ...unsavedChanges, fullName: text })
                }
                placeholder="Enter your full name"
              />

              <View style={styles.spacer} />

              <FormInput
                label="Phone Number"
                value={unsavedChanges.phone}
                onChangeText={(text) => setUnsavedChanges({ ...unsavedChanges, phone: text })}
                placeholder="+92 xxxxxxxxxx"
                keyboardType="phone-pad"
              />

              <View style={styles.spacer} />

              <FormInput
                label="Email Address"
                value={unsavedChanges.email}
                onChangeText={(text) => setUnsavedChanges({ ...unsavedChanges, email: text })}
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {/* Emergency Contact Fields (only for users) */}
              {userProfile.role === 'user' && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.subsectionTitle}>Emergency Contact</Text>

                  <FormInput
                    label="Emergency Contact Phone"
                    value={unsavedChanges.emergencyPhone}
                    onChangeText={(text) =>
                      setUnsavedChanges({ ...unsavedChanges, emergencyPhone: text })
                    }
                    placeholder="+92 xxxxxxxxxx"
                    keyboardType="phone-pad"
                  />

                  <View style={styles.spacer} />

                  <FormInput
                    label="Emergency Contact Email"
                    value={unsavedChanges.emergencyEmail}
                    onChangeText={(text) =>
                      setUnsavedChanges({ ...unsavedChanges, emergencyEmail: text })
                    }
                    placeholder="emergency@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </>
              )}

              {/* Save/Cancel Buttons */}
              <View style={styles.buttonRow}>
                <View style={styles.buttonWrapper}>
                  <PrimaryButton
                    title={saving ? 'Saving...' : 'Save Changes'}
                    onPress={handleSaveProfile}
                    disabled={saving}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setIsEditMode(false)}
                  style={styles.cancelButton}
                  disabled={saving}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <InfoRow label="Full Name" value={userProfile.fullName} />
              <View style={styles.divider} />
              <InfoRow label="Phone Number" value={userProfile.phone} />
              <View style={styles.divider} />
              <InfoRow label="Email Address" value={userProfile.email} />

              {userProfile.role === 'user' && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.subsectionTitle}>Emergency Contact</Text>
                  <InfoRow
                    label="Emergency Phone"
                    value={userProfile.emergencyPhone || 'Not set'}
                  />
                  <View style={styles.divider} />
                  <InfoRow
                    label="Emergency Email"
                    value={userProfile.emergencyEmail || 'Not set'}
                  />
                </>
              )}
            </>
          )}
        </View>

        {/* Guardians Section (only for users) */}
        {userProfile.role === 'user' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Linked Guardians</Text>
              {guardianLoading && <ActivityIndicator size="small" color="#4F2CF5" />}
            </View>

            {guardians.length > 0 ? (
              <View>
                {guardians.map((guardian, index) => (
                  <View key={guardian.id}>
                    <GuardianListItem
                      guardian={guardian}
                      onRemove={handleRemoveGuardian}
                      loading={guardianLoading}
                    />
                    {index < guardians.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyStateText}>No guardians linked yet</Text>
            )}

            <View style={styles.spacer} />
            <PrimaryButton
              title="+ Add Guardian"
              onPress={() => setShowAddGuardianModal(true)}
            />

            <View style={styles.spacer} />
            <PrimaryButton
              title="📨 Invite Guardian"
              onPress={() => setShowInviteGuardianModal(true)}
            />
          </View>
        )}

        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          <SettingLink
            icon="history"
            label="View Alert History"
            onPress={() => navigation?.push('AlertHistory', { isGuardian: userProfile.role !== 'user' })}
          />
          <View style={styles.divider} />

          <SettingLink
            icon="lock"
            label="Change Password"
            onPress={() => navigation?.push('ChangePassword')}
          />
          <View style={styles.divider} />

          <SettingLink
            icon="bell"
            label="Notification Settings"
            onPress={() => navigation?.push('NotificationSettings')}
          />
          <View style={styles.divider} />

          <SettingLink
            icon="map-marker"
            label="Location Settings"
            onPress={() => navigation?.push('LocationSettings')}
          />
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & Info</Text>

          <SettingLink
            icon="information"
            label="About ShieldHer"
            onPress={() =>
              Alert.alert(
                'About ShieldHer',
                'ShieldHer is a safety and empowerment application designed for women and their guardians.'
              )
            }
          />
          <View style={styles.divider} />

          <SettingLink
            icon="file-document"
            label="Privacy Policy"
            onPress={() =>
              Alert.alert('Privacy Policy', 'Privacy policy content will be displayed here.')
            }
          />
          <View style={styles.divider} />

          <SettingLink
            icon="file-document"
            label="Terms & Conditions"
            onPress={() =>
              Alert.alert(
                'Terms & Conditions',
                'Terms and conditions content will be displayed here.'
              )
            }
          />
          <View style={styles.divider} />

          <SettingLink
            icon="email"
            label="Contact Support"
            onPress={() =>
              Alert.alert(
                'Contact Support',
                'Email: support@shieldher.app\nPhone: +92 XXX XXXXXXX'
              )
            }
          />
        </View>

        {/* Logout Button */}
        <View style={[styles.section, styles.logoutSection]}>
          <TouchableOpacity
            onPress={handleLogout}
            style={styles.logoutButton}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="logout" size={20} color="#fff" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>

      {/* Add Guardian Modal */}
      <Modal
        visible={showAddGuardianModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddGuardianModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Guardian</Text>
              <TouchableOpacity
                onPress={() => setShowAddGuardianModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={24} color="#111318" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <FormInput
                label="Guardian Name"
                value={newGuardian.name}
                onChangeText={(text) => setNewGuardian({ ...newGuardian, name: text })}
                placeholder="Full name"
              />

              <View style={styles.spacer} />

              <FormInput
                label="Phone Number"
                value={newGuardian.phone}
                onChangeText={(text) => setNewGuardian({ ...newGuardian, phone: text })}
                placeholder="+92 xxxxxxxxxx"
                keyboardType="phone-pad"
              />

              <View style={styles.spacer} />

              <FormInput
                label="Email Address"
                value={newGuardian.email}
                onChangeText={(text) => setNewGuardian({ ...newGuardian, email: text })}
                placeholder="guardian@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={styles.spacer} />

              <FormInput
                label="Relationship (Optional)"
                value={newGuardian.relationship}
                onChangeText={(text) => setNewGuardian({ ...newGuardian, relationship: text })}
                placeholder="e.g., Mother, Sister, Friend"
              />

              <View style={styles.spacer} />
              <View style={styles.spacer} />

              <View style={styles.buttonRow}>
                <View style={styles.buttonWrapper}>
                  <PrimaryButton
                    title={addingGuardian ? 'Adding...' : 'Add Guardian'}
                    onPress={handleAddGuardian}
                    disabled={addingGuardian}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setShowAddGuardianModal(false)}
                  style={styles.cancelButton}
                  disabled={addingGuardian}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: insets.bottom + 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Invite Guardian Modal */}
      <Modal
        visible={showInviteGuardianModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInviteGuardianModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Guardian</Text>
              <TouchableOpacity
                onPress={() => setShowInviteGuardianModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={24} color="#111318" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.inviteDescription}>
                <MaterialCommunityIcons name="information" size={20} color="#0B26FF" />
                <Text style={styles.inviteDescriptionText}>
                  Send an invite to someone so they can become your guardian
                </Text>
              </View>

              <View style={styles.spacer} />

              <FormInput
                label="Guardian Email Address"
                value={inviteGuardianData.guardianEmail}
                onChangeText={(text) =>
                  setInviteGuardianData({ ...inviteGuardianData, guardianEmail: text })
                }
                placeholder="guardian@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={styles.spacer} />

              <Text style={styles.label}>Message (Optional)</Text>
              <TextInput
                value={inviteGuardianData.message}
                onChangeText={(text) =>
                  setInviteGuardianData({ ...inviteGuardianData, message: text })
                }
                placeholder="Why should they be your guardian?"
                placeholderTextColor="#9AA0A6"
                multiline
                numberOfLines={4}
                style={styles.messageInput}
              />

              <View style={styles.spacer} />
              <View style={styles.spacer} />

              <View style={styles.buttonRow}>
                <View style={styles.buttonWrapper}>
                  <PrimaryButton
                    title={sendingInvite ? 'Sending...' : 'Send Invite'}
                    onPress={handleSendGuardianInvite}
                    disabled={sendingInvite}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setShowInviteGuardianModal(false)}
                  style={styles.cancelButton}
                  disabled={sendingInvite}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: insets.bottom + 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

// Sub-component: Info Row (for display mode)
function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// Sub-component: Setting Link
function SettingLink({ icon, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.settingLink} activeOpacity={0.7}>
      <MaterialCommunityIcons name={icon} size={20} color="#4F2CF5" style={styles.settingIcon} />
      <Text style={styles.settingLabel}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color="#9AA0A6" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E9EAEE',
  },
  header: {
    backgroundColor: '#4F2CF5',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 8,
  },
  profileContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileImageCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitials: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  profileRole: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  editButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  messageSuccess: {
    backgroundColor: '#D1FAE5',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  messageError: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  messageIcon: {
    marginRight: 12,
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  messageTextSuccess: {
    color: '#065F46',
  },
  messageTextError: {
    color: '#991B1B',
  },
  messageClose: {
    padding: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111318',
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3D3F44',
    marginVertical: 12,
  },
  spacer: {
    height: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E2',
    marginVertical: 12,
  },
  infoRow: {
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9AA0A6',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111318',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  buttonWrapper: {
    flex: 1,
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#0B26FF',
    backgroundColor: '#fff',
  },
  cancelText: {
    color: '#0B26FF',
    fontWeight: '800',
    fontSize: 15,
  },
  settingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111318',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9AA0A6',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  logoutSection: {
    marginBottom: 24,
  },
  logoutButton: {
    backgroundColor: '#E01111',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: 50,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E2',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111318',
  },
  modalScrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3D3F44',
    marginBottom: 8,
  },
  messageInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111318',
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  inviteDescription: {
    backgroundColor: '#F0F4FF',
    borderLeftWidth: 4,
    borderLeftColor: '#0B26FF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  inviteDescriptionText: {
    flex: 1,
    fontSize: 13,
    color: '#0B26FF',
    fontWeight: '500',
  },
});

export default ProfileScreen;
