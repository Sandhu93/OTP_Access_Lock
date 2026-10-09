import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

import { UnlockGateScreen } from '@/screens/UnlockGateScreen';
import { LockerHomeScreen } from '@/screens/LockerHomeScreen';

import { PersonAScanScreen } from '@/screens/person-a/ScanScreen';
import { PersonALockerFoundScreen } from '@/screens/person-a/LockerFoundScreen';
import { PersonAConnectedScreen } from '@/screens/person-a/ConnectedScreen';
import { PersonAAccessRequestScreen } from '@/screens/person-a/AccessRequestScreen';
import { PersonAWaitingReviewScreen } from '@/screens/person-a/WaitingReviewScreen';
import { PersonAApprovedWaitingBScreen } from '@/screens/person-a/ApprovedWaitingBScreen';

import { PersonBScanScreen } from '@/screens/person-b/ScanScreen';
import { PersonBOtpScreen } from '@/screens/person-b/OtpConfirmationScreen';

import { DualPresenceVerificationScreen } from '@/screens/shared/DualPresenceVerificationScreen';
import { AuthorizationSuccessScreen } from '@/screens/shared/AuthorizationSuccessScreen';
import { FailureScreen } from '@/screens/shared/FailureScreen';

import { ActivityScreen } from '@/screens/ActivityScreen';
import { BenchTestScreen } from '@/screens/dev/BenchTestScreen';
import { StyleGuideScreen } from '@/screens/dev/StyleGuideScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Every screen draws its own TopBar/BottomNav, so the native header is
 * disabled here. Screens navigate with straightforward `navigation.navigate`
 * calls that mirror the artboard-to-artboard links in the approved canvas.
 */
export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }} initialRouteName="UnlockGate">
      <Stack.Screen name="UnlockGate" component={UnlockGateScreen} />
      <Stack.Screen name="LockerHome" component={LockerHomeScreen} />

      <Stack.Screen name="PersonAScan" component={PersonAScanScreen} />
      <Stack.Screen name="PersonALockerFound" component={PersonALockerFoundScreen} />
      <Stack.Screen name="PersonAConnected" component={PersonAConnectedScreen} />
      <Stack.Screen name="PersonAAccessRequest" component={PersonAAccessRequestScreen} />
      <Stack.Screen name="PersonAWaitingReview" component={PersonAWaitingReviewScreen} />
      <Stack.Screen name="PersonAApprovedWaitingB" component={PersonAApprovedWaitingBScreen} />

      <Stack.Screen name="PersonBScan" component={PersonBScanScreen} />
      <Stack.Screen name="PersonBOtp" component={PersonBOtpScreen} />

      <Stack.Screen name="DualPresenceVerification" component={DualPresenceVerificationScreen} />
      <Stack.Screen name="AuthorizationSuccess" component={AuthorizationSuccessScreen} />
      <Stack.Screen name="FailureState" component={FailureScreen} />

      <Stack.Screen name="Activity" component={ActivityScreen} />

      {/* Developer-only — never linked from the production flow. */}
      <Stack.Screen name="BenchTest" component={BenchTestScreen} />
      <Stack.Screen name="StyleGuide" component={StyleGuideScreen} />
    </Stack.Navigator>
  );
}
