/* global describe, it, expect */

global.__DEV__ = true;

const {
  normalizeScreamEvent,
  evaluateConsecutiveFrames,
  isInCooldown,
  buildDetectionTelemetry,
  DEFAULT_SCREAM_CONFIG,
} = require('../src/hooks/useScreamDetection');

describe('useScreamDetection helpers', () => {
  describe('normalizeScreamEvent', () => {
    it('normalizes valid payload with confidence', () => {
      const out = normalizeScreamEvent({ label: 'scream', confidence: 0.91, timestamp: 1234 }, 'native');
      expect(out).toEqual({
        label: 'scream',
        confidence: 0.91,
        timestamp: 1234,
        source: 'native',
      });
    });

    it('returns null for missing/invalid confidence', () => {
      expect(normalizeScreamEvent({ label: 'scream' }, 'native')).toBeNull();
      expect(normalizeScreamEvent({ confidence: 'bad' }, 'native')).toBeNull();
    });
  });

  describe('multi-frame validation', () => {
    it('Loud scream should trigger SOS (3 high-confidence frames in 2s)', () => {
      const now = 10000;
      const buffer = [
        { label: 'scream', confidence: 0.83, timestamp: now - 1200 },
        { label: 'scream', confidence: 0.89, timestamp: now - 700 },
        { label: 'scream', confidence: 0.93, timestamp: now - 200 },
      ];

      const result = evaluateConsecutiveFrames(
        buffer,
        DEFAULT_SCREAM_CONFIG.confidenceThreshold,
        DEFAULT_SCREAM_CONFIG.requiredConsecutiveFrames,
        DEFAULT_SCREAM_CONFIG.validationWindowMs,
        now
      );

      expect(result.trailingConsecutive).toBe(3);
      expect(result.shouldTrigger).toBe(true);
    });

    it('Background noise should NOT trigger (confidence below threshold)', () => {
      const now = 10000;
      const buffer = [
        { label: 'scream', confidence: 0.51, timestamp: now - 1200 },
        { label: 'scream', confidence: 0.62, timestamp: now - 700 },
        { label: 'noise', confidence: 0.95, timestamp: now - 200 },
      ];

      const result = evaluateConsecutiveFrames(
        buffer,
        DEFAULT_SCREAM_CONFIG.confidenceThreshold,
        DEFAULT_SCREAM_CONFIG.requiredConsecutiveFrames,
        DEFAULT_SCREAM_CONFIG.validationWindowMs,
        now
      );

      expect(result.shouldTrigger).toBe(false);
      expect(result.trailingConsecutive).toBeLessThan(3);
    });
  });

  describe('cooldown protection', () => {
    it('Repeated screams during cooldown are blocked', () => {
      const now = 100000;
      const lastTrigger = now - 30000; // 30s ago
      const blocked = isInCooldown(lastTrigger, now, DEFAULT_SCREAM_CONFIG.cooldownMs);
      expect(blocked).toBe(true);
    });

    it('Detection is allowed after cooldown expires', () => {
      const now = 100000;
      const lastTrigger = now - 61000; // 61s ago
      const blocked = isInCooldown(lastTrigger, now, DEFAULT_SCREAM_CONFIG.cooldownMs);
      expect(blocked).toBe(false);
    });
  });

  describe('false alarm telemetry', () => {
    it('User-cancelled AI alert logs cancelledByUser without triggering SOS', () => {
      const event = buildDetectionTelemetry({
        confidence: 0.88,
        timestamp: Date.now(),
        triggeredSOS: false,
        cancelledByUser: true,
        source: 'onScreamConfidence',
      });

      expect(event.eventType).toBe('AI_DETECTION_EVENT');
      expect(event.triggeredSOS).toBe(false);
      expect(event.cancelledByUser).toBe(true);
      expect(event.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });
});
