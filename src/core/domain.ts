import type { AcousticClassification } from './acoustic';

export interface Facility {
  name: string;
  operator: string;
  region: string;
  gatewayId: string;
  firmware: string;
}

export interface AcousticEvent {
  id: string;
  /** Internal gateway storage key retained for Firestore compatibility. */
  siloId: string;
  clock: string;
  minutesAgo: number;
  scanId: string;
  probeId: string;
  probabilityInfested: number | null;
  classification: AcousticClassification | null;
  windowProbabilities: number[];
  windowCount: number;
  temperatureC: number | null;
  humidityPct: number | null;
  dhtValid: boolean;
  batteryV: number | null;
  modelName: string;
  modelVersion: string;
}

export interface VisionScan {
  id: string;
  /** Internal gateway storage key retained for Firestore compatibility. */
  siloId: string;
  label: string;
  day: string;
  minutesAgo: number;
  sampleSize: number;
  boreHoles: number;
  discoloration: number;
  fragmentation: number;
  mould: number;
  confidence: number;
}
