import { useEffect, useState } from 'react';

declare global {
  interface Window {
    kakao: any;
  }
}

const APP_KEY = import.meta.env.VITE_KAKAO_MAP_APP_KEY as string | undefined;

let loadPromise: Promise<void> | null = null;

function loadKakaoMapScript(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${APP_KEY}&autoload=false`;
    script.onload = () => {
      try {
        window.kakao.maps.load(() => resolve());
      } catch {
        // 쿼터 초과, 서비스 비활성화 등 SDK 초기화 단계에서 던지는 에러도 여기서 잡는다.
        reject(new Error('카카오맵 SDK 초기화 실패'));
      }
    };
    script.onerror = () => reject(new Error('카카오맵 SDK 로드 실패'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function useKakaoMap() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!APP_KEY) {
      setError('지도를 사용할 수 없어요.');
      return;
    }
    loadKakaoMapScript()
      .then(() => setIsLoaded(true))
      .catch(() => setError('지도를 사용할 수 없어요.'));
  }, []);

  return { isLoaded, error, isConfigured: Boolean(APP_KEY) };
}
