import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Feather';

import DashboardScreen from '../screens/DashboardScreen';
import ScannerScreen from '../screens/ScannerScreen';
import InsightsScreen from '../screens/InsightsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { colors, space, type } from '../core/theme';

const Tab = createBottomTabNavigator();

const tabIcon = (name: string) =>
  function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return (
      <View style={styles.iconWrap}>
        <View style={[styles.marker, focused && styles.markerOn]} />
        <Icon name={name} size={20} color={color} />
      </View>
    );
  };

const TABS = [
  { name: 'Dashboard', label: 'Overview', tabBarIcon: tabIcon('grid'), component: DashboardScreen },
  { name: 'Scanner', label: 'Scan', tabBarIcon: tabIcon('crosshair'), component: ScannerScreen },
  { name: 'Insights', label: 'Analysis', tabBarIcon: tabIcon('bar-chart-2'), component: InsightsScreen },
  { name: 'Settings', label: 'Settings', tabBarIcon: tabIcon('settings'), component: SettingsScreen },
] as const;

/**
 * The active tab is marked by a rule above the icon as well as by tint, which
 * matches the underline selection used everywhere else in the app.
 *
 * Note there is no explicit height or bottom padding on tabBarStyle: the
 * navigator derives both from the device's safe-area inset. Hardcoding them
 * (as this file previously did) clips the bar on devices with a home
 * indicator or a gesture bar.
 */
export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarHideOnKeyboard: true,
      }}
    >
      {TABS.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarLabel: tab.label,
            tabBarAccessibilityLabel: tab.label,
            tabBarIcon: tab.tabBarIcon,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    elevation: 0,
  },
  item: { paddingTop: space.xs },
  label: { ...type.label, marginTop: space.xxs },
  iconWrap: { alignItems: 'center' },
  marker: {
    width: 20,
    height: 2,
    borderRadius: 1,
    marginBottom: space.sm,
    backgroundColor: 'transparent',
  },
  markerOn: { backgroundColor: colors.accent },
});
