/**
 * Shared route map.
 *
 * Kept in its own module so screens can type their navigation prop without
 * importing the navigator that renders them.
 */
export type RootStackParamList = {
  /** Shown while the session is resolved; never navigated to by hand. */
  Boot: undefined;
  Auth: undefined;
  ConnectionError: undefined;
  MainApp: { screen?: 'Dashboard' | 'Scanner' | 'Insights' | 'Settings' } | undefined;
  Notifications: undefined;
  ScanResults:
    | {
        siloId?: string;
        mode?: 'vision' | 'acoustic';
        visualResult?: import('../services/visualScanService').VisualScanResult;
      }
    | undefined;
  AcousticDetail: { siloId?: string; eventId?: string } | undefined;
  VisionHistory: { siloId?: string; scanId?: string } | undefined;
  Profile: undefined;
  SiloManagement: undefined;
  /** Existing probe details. */
  SiloEdit: { siloId?: string } | undefined;
  ThresholdConfig: undefined;
  About: undefined;
};
