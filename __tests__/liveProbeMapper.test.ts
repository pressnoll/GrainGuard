jest.mock('@react-native-firebase/firestore', () => ({
  Timestamp: { fromMillis: (value: number) => ({ seconds: value / 1000 }) },
}));

import { siloFromDoc } from '../src/services/mappers';

describe('live probe state mapping', () => {
  test('maps the deployed gateway fields without inventing UI metadata', () => {
    const now = 1_788_360_000_000;
    const probe = siloFromDoc(
      'ksks',
      {
        probeId: 'P01',
        lastSeenAt: { seconds: now / 1000 },
        environment: {
          capturedAt: { seconds: now / 1000 },
          temperatureC: 30.9,
          humidityPct: 85.7,
          source: 'probe',
        },
      },
      now,
    );

    expect(probe.code).toBe('P01');
    expect(probe.nodeId).toBe('P01');
    expect(probe.crop).toBe('Not set');
    expect(probe.nodeOnline).toBe(true);
    expect(probe.environment.temperatureAvailable).toBe(true);
    expect(probe.environment.humidityAvailable).toBe(true);
    expect(probe.environment.relativeHumidity).toBe(85.7);
    expect(probe.environment.moistureAvailable).toBe(false);
  });

  test('marks absent channels unavailable instead of presenting fallback zeros', () => {
    const probe = siloFromDoc('route', { probeId: 'P02' }, 1_000_000);

    expect(probe.hasReported).toBe(false);
    expect(probe.environment.temperatureAvailable).toBe(false);
    expect(probe.environment.humidityAvailable).toBe(false);
    expect(probe.vision.sampleSize).toBe(0);
    expect(probe.vision.model).toBe('unavailable');
  });
});
