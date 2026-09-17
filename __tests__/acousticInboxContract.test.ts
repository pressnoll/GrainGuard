jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getFirestore: jest.fn(),
  onSnapshot: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(),
}));
jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn() }));
jest.mock('@react-native-firebase/auth', () => ({ getAuth: jest.fn() }));

import { acousticInboxEventFromDoc } from '../src/services/acousticInboxService';
import { ACOUSTIC_FEATURE_COUNT } from '../src/services/acousticInferenceService';

const scanId = 'P01-CONTRACT-1';

const validEvent = () => ({
  scanId,
  probeId: 'P01',
  siloId: 'ksks',
  protocolVersion: 1,
  featureSchema: 1,
  featureSpace: 'raw',
  sampleRateHz: 24000,
  windowSeconds: 1,
  windowCount: 5,
  sequence: 1,
  firmware: 'probe-v1.0.0',
  environment: {
    temperatureC: 30.9,
    humidityPct: 85.6,
    dhtValid: true,
  },
  device: { batteryV: 3.266 },
  windows: Array.from({ length: 5 }, (_, index) => ({
    index,
    measured_sample_rate_hz: 23973.7,
    features: Array.from(
      { length: ACOUSTIC_FEATURE_COUNT },
      (_unused, featureIndex) => index + featureIndex / 100,
    ),
  })),
  receivedAt: { seconds: 1_788_360_000, nanoseconds: 0 },
});

describe('live acoustic inbox contract', () => {
  test('accepts the deployed P01 piezo feature schema without renaming fields', () => {
    const event = acousticInboxEventFromDoc(scanId, validEvent());

    expect(event.probeId).toBe('P01');
    expect(event.siloId).toBe('ksks');
    expect(event.windows).toHaveLength(5);
    expect(event.windows[0].features).toHaveLength(30);
    expect(event.windows[0].measuredSampleRateHz).toBe(23973.7);
    expect(event.environment).toEqual({
      temperatureC: 30.9,
      humidityPct: 85.6,
      dhtValid: true,
    });
  });

  test('rejects an incomplete piezo vector rather than classifying dummy data', () => {
    const event = validEvent();
    event.windows[2].features.pop();

    expect(() => acousticInboxEventFromDoc(scanId, event)).toThrow(
      'must contain 30 features',
    );
  });
});
