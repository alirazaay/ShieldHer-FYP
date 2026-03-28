/* global describe, it, expect */

const { normalizePhoneNumber, buildPhoneNumber, maskPhone } = require('../src/utils/phone');

describe('phone utilities', () => {
  describe('normalizePhoneNumber', () => {
    it('normalizes formatted international numbers', () => {
      expect(normalizePhoneNumber('+92 (300) 123-4567')).toBe('+923001234567');
      expect(normalizePhoneNumber('0092 300 1234567')).toBe('+923001234567');
    });

    it('returns null for invalid input', () => {
      expect(normalizePhoneNumber(null)).toBeNull();
      expect(normalizePhoneNumber('')).toBeNull();
      expect(normalizePhoneNumber('+000123')).toBeNull();
    });
  });

  describe('buildPhoneNumber', () => {
    it('builds and normalizes from country code and local number', () => {
      expect(buildPhoneNumber('+92', '03001234567')).toBe('+923001234567');
      expect(buildPhoneNumber('92', '300-123-4567')).toBe('+923001234567');
    });

    it('returns null when pieces are missing', () => {
      expect(buildPhoneNumber('', '3001234567')).toBeNull();
      expect(buildPhoneNumber('+92', '')).toBeNull();
    });
  });

  describe('maskPhone', () => {
    it('masks valid phones safely for logs', () => {
      expect(maskPhone('+923001234567')).toBe('+9230***67');
    });

    it('falls back for invalid phones', () => {
      expect(maskPhone('bad-input')).toBe('***');
    });
  });
});
