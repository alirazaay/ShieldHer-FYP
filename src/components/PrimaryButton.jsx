import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

const PrimaryButton = ({ title, onPress, style, textStyle, disabled }) => {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && { opacity: 0.6 }, style]}
    >
      <Text style={[styles.text, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#0B26FF',
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default PrimaryButton;
