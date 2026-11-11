import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

// SDK를 직접 부르지 않고 주입받는 이유: 토스 앱 밖(node 테스트, 브라우저 dev)에서는
// 네이티브 브리지가 없어서, 실제 SDK로는 로드/표시 흐름을 검증할 수 없기 때문이다.
export type FullScreenAdSdk = {
  isSupported: () => boolean;
  load: (params: Parameters<typeof loadFullScreenAd>[0]) => ReturnType<typeof loadFullScreenAd>;
  show: (params: Parameters<typeof showFullScreenAd>[0]) => ReturnType<typeof showFullScreenAd>;
};

type State = 'idle' | 'loading' | 'ready' | 'showing';

export function createFullScreenAdController(sdk: FullScreenAdSdk, adGroupId: string | undefined) {
  let state: State = 'idle';

  const enabled = () => {
    if (!adGroupId) return false;
    try {
      return sdk.isSupported();
    } catch {
      return false;
    }
  };

  function preload() {
    if (!enabled() || state !== 'idle') return;
    state = 'loading';
    try {
      const cleanup = sdk.load({
        options: { adGroupId: adGroupId! },
        onEvent: (event) => {
          if (event.type === 'loaded') {
            state = 'ready';
            cleanup?.();
          }
        },
        onError: (error) => {
          console.error('전면 광고 로드 실패:', error);
          state = 'idle';
          cleanup?.();
        },
      });
    } catch (error) {
      console.error('전면 광고 로드 호출 실패:', error);
      state = 'idle';
    }
  }

  // 광고가 준비되지 않았으면 조용히 건너뛴다. 사용자가 상세 화면을 보는 흐름을
  // 광고 로딩 때문에 막지 않는 게 우선이다.
  function showIfReady() {
    if (!enabled() || state !== 'ready') return;
    state = 'showing';

    const finish = (cleanup?: () => void) => {
      cleanup?.();
      state = 'idle';
      // 한 번 보여준 광고는 재사용할 수 없어서, 다음 상세 진입을 위해 바로 새로 불러온다.
      preload();
    };

    try {
      const cleanup = sdk.show({
        options: { adGroupId: adGroupId! },
        onEvent: (event) => {
          if (event.type === 'dismissed' || event.type === 'failedToShow') finish(cleanup);
        },
        onError: (error) => {
          console.error('전면 광고 표시 실패:', error);
          finish(cleanup);
        },
      });
    } catch (error) {
      console.error('전면 광고 표시 호출 실패:', error);
      state = 'idle';
    }
  }

  return { preload, showIfReady };
}

// 콘솔 지면 '상세 전면 광고'. 광고 그룹 ID는 공개돼도 되는 값이라 env가 없을 때를
// 대비해 기본값으로 둔다 — 배너처럼 env 누락으로 광고가 조용히 꺼지는 일을 막기 위함.
const DETAIL_AD_GROUP_ID =
  (import.meta.env.VITE_TOSS_DETAIL_AD_GROUP_ID as string | undefined) ?? 'ait.v2.live.eebe2d5848194cb2';

export const detailFullScreenAd = createFullScreenAdController(
  {
    isSupported: () => loadFullScreenAd.isSupported() && showFullScreenAd.isSupported(),
    load: loadFullScreenAd,
    show: showFullScreenAd,
  },
  DETAIL_AD_GROUP_ID,
);
