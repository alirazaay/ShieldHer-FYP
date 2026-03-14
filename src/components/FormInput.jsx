import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

const FormInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  containerStyle,
  outerStyle,
  inputStyle,
  labelStyle,
  ...rest
}) => {
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
  <View style={[styles.inputOuter, outerStyle]}>
        <TextInput
          style={[styles.input, inputStyle]}
          placeholder={placeholder}
          placeholderTextColor="#9AA0A6"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          {...rest}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3D3F44',
    marginBottom: 10,
  },
  inputOuter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 46,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  input: {
    fontSize: 15,
    color: '#111318',
  },
});

export default FormInput;
