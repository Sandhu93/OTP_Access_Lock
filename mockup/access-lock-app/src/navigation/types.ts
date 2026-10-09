export type FailureType =
  | 'connectionFailed'
  | 'encryptionNotEstablished'
  | 'lockerDisconnected'
  | 'adminRejected'
  | 'requestExpired'
  | 'personADisconnected'
  | 'backendUnavailable'
  | 'authorizationDenied'
  | 'lockerResetCancelled';

export type RootStackParamList = {
  UnlockGate: undefined;
  LockerHome: undefined;

  PersonAScan: undefined;
  PersonALockerFound: undefined;
  PersonAConnected: undefined;
  PersonAAccessRequest: undefined;
  PersonAWaitingReview: undefined;
  PersonAApprovedWaitingB: undefined;

  PersonBScan: undefined;
  PersonBOtp: undefined;

  DualPresenceVerification: { role: 'A' | 'B' };
  AuthorizationSuccess: undefined;

  Activity: undefined;
  FailureState: { type: FailureType };

  BenchTest: undefined;
  StyleGuide: undefined;
};
