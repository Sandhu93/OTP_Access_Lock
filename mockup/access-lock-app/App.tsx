import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import {
  useFonts as useIBMPlexSans,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold
} from '@expo-google-fonts/ibm-plex-sans';
import {
  useFonts as useIBMPlexMono,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold
} from '@expo-google-fonts/ibm-plex-mono';

import { RootNavigator } from '@/navigation/RootNavigator';
import { colors } from '@/theme/tokens';

export default function App() {
  const [sansLoaded] = useIBMPlexSans({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold
  });
  const [monoLoaded] = useIBMPlexMono({
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold
  });

  if (!sansLoaded || !monoLoaded) {
    // Keep this blank frame brief — swap in your org's native splash
    // screen (expo-splash-screen) rather than a spinner here.
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
