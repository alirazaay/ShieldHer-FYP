const E164_REGEX = /^\+[1-9]\d{9,14}$/;

/**
 * Normalize a phone string to an E.164-like representation.
 * Examples:
 * - "0092 300-1234567" -> "+923001234567"
 * - "+92 (300) 1234567" -> "+923001234567"
 *
 * @param {string} value Raw phone input
 * @returns {string|null} Normalized phone string or null when invalid
 */
export function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;

  let normalized = value.trim();
  if (!normalized) return null;

  // Remove common formatting characters.
  normalized = normalized.replace(/[\s()-]/g, '');

  // Convert international prefix "00" to "+".
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  // Ensure leading plus for downstream storage/hash consistency.
  if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }

  // Keep digits only after the plus.
  normalized = `+${normalized.slice(1).replace(/\D/g, '')}`;

  if (!E164_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Build a normalized full phone number from country code + local number.
 * Strips local trunk zeros (e.g. 0300... => 300...).
 *
 * @param {string} countryCode e.g. "+92"
 * @param {string} localNumber e.g. "3001234567"
 * @returns {string|null} Normalized full phone number
 */
export function buildPhoneNumber(countryCode, localNumber) {
  if (typeof countryCode !== 'string' || typeof localNumber !== 'string') {
    return null;
  }

  const ccDigits = countryCode.replace(/\D/g, '');
  const localDigits = localNumber.replace(/\D/g, '').replace(/^0+/, '');

  if (!ccDigits || !localDigits) {
    return null;
  }

  return normalizePhoneNumber(`+${ccDigits}${localDigits}`);
}

/**
 * Mask phone for safe logs.
 * @param {string|null|undefined} phone
 * @returns {string}
 */
export function maskPhone(phone) {
  const normalized = normalizePhoneNumber(phone || '');
  if (!normalized) return '***';
  return `${normalized.slice(0, 5)}***${normalized.slice(-2)}`;
}
