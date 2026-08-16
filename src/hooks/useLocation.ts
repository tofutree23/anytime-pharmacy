import { useCallback, useEffect, useState } from 'react';
import { Accuracy, Device, GetCurrentLocationPermissionError } from '@apps-in-toss/web-framework';

export type LocationState =
  | { status: 'loading' }
  | { status: 'granted'; lat: number; lng: number }
  | { status: 'fallback' };

export function useLocation() {
  const [state, setState] = useState<LocationState>({ status: 'loading' });

  const requestAgain = useCallback(() => {
    setState({ status: 'loading' });

    Device.getLocation({ accuracy: Accuracy.Balanced })
      .then((location) => {
        setState({ status: 'granted', lat: location.coords.latitude, lng: location.coords.longitude });
      })
      .catch((error) => {
        if (error instanceof GetCurrentLocationPermissionError) {
          setState({ status: 'fallback' });
          return;
        }
        setState({ status: 'fallback' });
      });
  }, []);

  useEffect(() => {
    requestAgain();
  }, [requestAgain]);

  return { state, requestAgain };
}
