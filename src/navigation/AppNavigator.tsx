import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';

import AuthScreen from '../screens/AuthScreen';
import BootScreen from '../screens/BootScreen';
import BottomTabNavigator from './BottomTabNavigator';

// Sub-screens pushed on top of the tabs.
import NotificationsScreen from '../screens/NotificationsScreen';
import ScanResultsScreen from '../screens/ScanResultsScreen';
import AcousticDetailScreen from '../screens/AcousticDetailScreen';
import VisionHistoryScreen from '../screens/VisionHistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SiloManagementScreen from '../screens/SiloManagementScreen';
import SiloEditScreen from '../screens/SiloEditScreen';
import ThresholdConfigScreen from '../screens/ThresholdConfigScreen';
import AboutScreen from '../screens/AboutScreen';
import ConnectionErrorScreen from '../screens/ConnectionErrorScreen';

import { colors } from '../core/theme';
import { useAuthError, useBootstrapping, useSignedIn } from '../state/authStore';
import { useFacilityError, useProbesLoaded, useSilos } from '../state/facilityStore';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Navigation's own theme has to match the app ground, otherwise the container
 * paints its default background during a transition and every push flashes a
 * lighter rectangle behind the incoming screen.
 */
const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.ground,
    card: colors.surface,
    text: colors.text,
    border: colors.hairline,
    notification: colors.critical,
  },
};

/**
 * The session decides which screens exist.
 *
 * Signing in and out is a change of route map, not a `replace` call: the screens
 * for the other state are not mounted, so there is no back gesture into a
 * dashboard after signing out and no stale form left behind after signing in.
 * It also means no screen has to know how to navigate on an auth change — the
 * auth store updates, and the tree follows.
 */
export default function AppNavigator() {
  const signedIn = useSignedIn();
  const bootstrapping = useBootstrapping();
  const probesLoaded = useProbesLoaded();
  const probes = useSilos();
  const authError = useAuthError();
  const facilityError = useFacilityError();
  const loadError = authError || facilityError;
  const awaitingProbeState = signedIn && !probesLoaded && !loadError;
  const connectionFailed = signedIn && !probesLoaded && Boolean(loadError);
  const probeMissing = signedIn && probesLoaded && probes.length === 0;

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.ground },
        }}
      >
        {bootstrapping || awaitingProbeState ? (
          <Stack.Screen name="Boot" component={BootScreen} options={{ animation: 'none' }} />
        ) : connectionFailed || probeMissing ? (
          <Stack.Screen
            name="ConnectionError"
            component={ConnectionErrorScreen}
            options={{ animation: 'fade' }}
          />
        ) : signedIn ? (
          <Stack.Group>
            <Stack.Screen
              name="MainApp"
              component={BottomTabNavigator}
              options={{ animation: 'fade' }}
            />

            {/* A scan result is the outcome of the capture below it, so it rises
                from the bottom rather than sliding in from the side. */}
            <Stack.Screen
              name="ScanResults"
              component={ScanResultsScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ animation: 'slide_from_bottom' }}
            />

            <Stack.Screen name="AcousticDetail" component={AcousticDetailScreen} />
            <Stack.Screen name="VisionHistory" component={VisionHistoryScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="SiloManagement" component={SiloManagementScreen} />
            <Stack.Screen name="SiloEdit" component={SiloEditScreen} />
            <Stack.Screen name="ThresholdConfig" component={ThresholdConfigScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
          </Stack.Group>
        ) : (
          <Stack.Group>
            <Stack.Screen name="Auth" component={AuthScreen} options={{ animation: 'fade' }} />
            {/* Reachable before signing in: the build details and the model
                notes are what a new user checks first. */}
            <Stack.Screen name="About" component={AboutScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
