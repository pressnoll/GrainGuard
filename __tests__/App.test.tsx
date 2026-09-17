/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockStart = jest.fn();

jest.mock('../src/navigation/AppNavigator', () => () => null);
jest.mock('../src/state/authStore', () => ({
  useAuthStore: (selector: (state: { start: typeof mockStart }) => unknown) =>
    selector({ start: mockStart }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
  expect(mockStart).toHaveBeenCalledTimes(1);
});
