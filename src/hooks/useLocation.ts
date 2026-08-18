import { useCallback, useEffect, useRef, useState } from 'react';
import { Accuracy, Device, GetCurrentLocationPermissionError } from '@apps-in-toss/web-framework';

export type LocationState =
  | { status: 'loading' }
  | { status: 'granted'; lat: number; lng: number }
  | { status: 'fallback' };

// Device.getLocation은 timeout 옵션이 없다. 권한 다이얼로그에 사용자가 응답하지
// 않거나 GPS fix 확보가 오래 걸리면 프로미스가 resolve도 reject도 되지 않은 채
// 계속 pending 상태로 남아, 그동안 화면 전체가 로딩 문구에 갇힌다. 그래서 여기서
// 자체적으로 상한을 두고, 시간 안에 응답이 없으면 지역 직접 선택(fallback)으로
// 넘어가게 한다.
const LOCATION_TIMEOUT_MS = 5000;

export function useLocation() {
  const [state, setState] = useState<LocationState>({ status: 'loading' });
  // 타임아웃으로 이미 fallback 처리한 뒤에 원래 GPS 요청이 뒤늦게 resolve/reject
  // 되면서 최신 상태(예: 사용자가 그 사이 지역을 직접 고른 것)를 덮어쓰지 않도록,
  // 요청마다 세대 번호를 매겨 자신이 최신 요청일 때만 setState한다.
  const requestIdRef = useRef(0);

  const requestAgain = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState({ status: 'loading' });

    const timeoutId = setTimeout(() => {
      if (requestIdRef.current !== requestId) return;
      setState({ status: 'fallback' });
    }, LOCATION_TIMEOUT_MS);

    Device.getLocation({ accuracy: Accuracy.Balanced })
      .then((location) => {
        clearTimeout(timeoutId);
        if (requestIdRef.current !== requestId) return;
        setState({ status: 'granted', lat: location.coords.latitude, lng: location.coords.longitude });
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        if (requestIdRef.current !== requestId) return;
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
