import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {BleManager, State} from 'react-native-ble-plx';

const {
  LOCK_COMMAND_CHARACTERISTIC_UUID,
  LOCK_DEVICE_NAME,
  LOCK_SERVICE_UUID,
  base64ToBytes,
  bytesToBase64,
  cancelFrame,
  closeSessionFrame,
  openSessionFrame,
  parseResponseFrame,
  requestUnlockFrame,
  sessionHeartbeatFrame,
  submitTokenFrame,
} = require('./lockProtocol');

async function requestBlePermissions() {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(result).every(value => value === PermissionsAndroid.RESULTS.GRANTED);
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function useLockBle() {
  const managerRef = useRef(null);
  const notificationRef = useRef(null);
  const [bleState, setBleState] = useState(State.Unknown);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);
  const [lastError, setLastError] = useState('');
  const [sessionOpen, setSessionOpen] = useState(false);

  useEffect(() => {
    const manager = new BleManager();
    managerRef.current = manager;
    const subscription = manager.onStateChange(nextState => setBleState(nextState), true);

    requestBlePermissions()
      .then(setPermissionGranted)
      .catch(error => {
        setPermissionGranted(false);
        setLastError(error.message);
      });

    return () => {
      notificationRef.current?.remove();
      subscription.remove();
      manager.destroy();
    };
  }, []);

  const connected = Boolean(connectedDevice);
  const ready = connected && bleState === State.PoweredOn;

  const upsertDevice = useCallback(device => {
    if (!device?.id || device.name !== LOCK_DEVICE_NAME) {
      return;
    }
    setDevices(current => {
      const existing = current.find(item => item.id === device.id);
      if (existing) {
        return current.map(item => (item.id === device.id ? device : item));
      }
      return [...current, device];
    });
  }, []);

  const stopScan = useCallback(() => {
    managerRef.current?.stopDeviceScan();
    setIsScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    setLastError('');
    setDevices([]);

    if (!permissionGranted) {
      const granted = await requestBlePermissions();
      setPermissionGranted(granted);
      if (!granted) {
        setLastError('Bluetooth permission denied');
        return;
      }
    }

    if (bleState !== State.PoweredOn) {
      setLastError('Bluetooth is not powered on');
      return;
    }

    setIsScanning(true);
    managerRef.current.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setLastError(error.message);
        stopScan();
        return;
      }
      upsertDevice(device);
    });

    setTimeout(stopScan, 8000);
  }, [bleState, permissionGranted, stopScan, upsertDevice]);

  const subscribeToResponses = useCallback(device => {
    notificationRef.current?.remove();
    notificationRef.current = device.monitorCharacteristicForService(
      LOCK_SERVICE_UUID,
      LOCK_COMMAND_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          setLastError(error.message);
          return;
        }
        if (characteristic?.value) {
          const response = parseResponseFrame(base64ToBytes(characteristic.value));
          setLastResponse(response);
          if (response.mappedText === 'SESSION_OPENED' || response.mappedText === 'SESSION_ACTIVE') {
            setSessionOpen(true);
          } else if (
            response.mappedText === 'SESSION_CLOSED' ||
            response.mappedText === 'ERR_SESSION_REQUIRED' ||
            response.mappedText === 'ERR_SESSION_CONFLICT'
          ) {
            setSessionOpen(false);
          }
        }
      },
    );
  }, []);

  const connect = useCallback(async device => {
    setIsBusy(true);
    setLastError('');
    try {
      stopScan();
      const connectedLock = await managerRef.current.connectToDevice(device.id, {autoConnect: false});
      const discovered = await connectedLock.discoverAllServicesAndCharacteristics();
      setConnectedDevice(discovered);
      setSessionOpen(false);
      subscribeToResponses(discovered);
      return true;
    } catch (error) {
      setLastError(error.message);
      setConnectedDevice(null);
      setSessionOpen(false);
      try {
        await managerRef.current?.cancelDeviceConnection(device.id);
      } catch (disconnectError) {
        // The original connection failure is the actionable error for the UI.
      }
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [stopScan, subscribeToResponses]);

  const disconnect = useCallback(async () => {
    setLastError('');
    notificationRef.current?.remove();
    notificationRef.current = null;
    if (connectedDevice) {
      try {
        await managerRef.current.cancelDeviceConnection(connectedDevice.id);
      } catch (error) {
        setLastError(error.message);
      }
    }
    setConnectedDevice(null);
    setSessionOpen(false);
  }, [connectedDevice]);

  const writeFrame = useCallback(async frame => {
    if (!connectedDevice) {
      setLastError('Not connected');
      return;
    }

    setIsBusy(true);
    setLastError('');
    try {
      await connectedDevice.writeCharacteristicWithResponseForService(
        LOCK_SERVICE_UUID,
        LOCK_COMMAND_CHARACTERISTIC_UUID,
        bytesToBase64(frame),
      );
    } catch (error) {
      setLastError(error.message);
    } finally {
      setIsBusy(false);
    }
  }, [connectedDevice]);

  useEffect(() => {
    if (!sessionOpen || !connectedDevice) {
      return undefined;
    }

    const heartbeatTimer = setInterval(() => {
      writeFrame(sessionHeartbeatFrame());
    }, 5000);

    return () => clearInterval(heartbeatTimer);
  }, [connectedDevice, sessionOpen, writeFrame]);

  const actions = useMemo(() => ({
    openSession: (role, sessionId) => writeFrame(openSessionFrame(role, sessionId)),
    heartbeat: () => writeFrame(sessionHeartbeatFrame()),
    closeSession: () => writeFrame(closeSessionFrame()),
    requestUnlock: () => writeFrame(requestUnlockFrame()),
    submitToken: token => writeFrame(submitTokenFrame(token)),
    cancel: () => writeFrame(cancelFrame()),
  }), [writeFrame]);

  return {
    bleState,
    permissionGranted,
    isScanning,
    devices,
    connectedDevice,
    connected,
    sessionOpen,
    ready,
    isBusy,
    lastResponse,
    lastError,
    startScan,
    stopScan,
    connect,
    disconnect,
    actions,
  };
}
