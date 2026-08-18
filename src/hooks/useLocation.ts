import { useCallback, useEffect, useRef, useState } from 'react';
import { Accuracy, Device } from '@apps-in-toss/web-framework';

export type LocationState =
  | { status: 'loading' }
  | { status: 'granted'; lat: number; lng: number }
  | { status: 'fallback' }
  // getPermission()이 'osPermissionDenied'인 경우: 앱인토스 자체 권한 다이얼로그로도 못
  // 바꾸는, OS 설정 단계에서 막힌 상태. 재요청 버튼을 눌러도 아무 효과가 없으니
  // RegionPicker에서 재요청 대신 "설정에서 켜주세요" 안내로 갈라져야 한다.
  | { status: 'blocked' };

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

    const finish = (next: LocationState) => {
      clearTimeout(timeoutId);
      if (requestIdRef.current !== requestId) return;
      setState(next);
    };

    (async () => {
      try {
        // 한 번 거부된 뒤 Device.getLocation()을 그냥 다시 호출하면 다이얼로그 없이
        // 곧바로 다시 거부된다 — 앱인토스가 재요청 전용 다이얼로그(openPermissionDialog)를
        // 따로 제공하므로, denied 상태를 감지하면 그걸로 다시 물어봐야 한다.
        // (getPermission의 반환값 중 osPermissionDenied는 현재 SDK 타입에 아직 반영 안 돼
        // 있어 문자열로 비교한다.)
        const permission = (await Device.getLocation.getPermission()) as string;

        if (permission === 'osPermissionDenied') {
          finish({ status: 'blocked' });
          return;
        }

        if (permission === 'denied') {
          const result = await Device.getLocation.openPermissionDialog();
          if (result !== 'allowed') {
            finish({ status: 'fallback' });
            return;
          }
        }

        const location = await Device.getLocation({ accuracy: Accuracy.Balanced });
        finish({ status: 'granted', lat: location.coords.latitude, lng: location.coords.longitude });
      } catch {
        finish({ status: 'fallback' });
      }
    })();
  }, []);

  useEffect(() => {
    requestAgain();
  }, [requestAgain]);

  return { state, requestAgain };
}
