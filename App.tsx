import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/state/authStore';

function App(): React.JSX.Element {
  const start = useAuthStore(s => s.start);

  React.useEffect(() => {
    // Deliberately no cleanup. The auth listener is the app's lifetime, not this
    // component's, and tearing it down on a fast-refresh remount would leave the
    // store holding a user nobody is watching any more. `start` is idempotent.
    start();
  }, [start]);

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}

export default App;
