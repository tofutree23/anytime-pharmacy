import { useEffect, useRef } from 'react';
import { useTossBanner } from '../hooks/useTossBanner';

const AD_GROUP_ID = import.meta.env.VITE_TOSS_AD_GROUP_ID as string | undefined;

export function BannerAd() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isInitialized, attachBanner } = useTossBanner();

  useEffect(() => {
    if (!isInitialized || !containerRef.current || !AD_GROUP_ID) return;

    const attached = attachBanner(AD_GROUP_ID, containerRef.current, {
      theme: 'auto',
      tone: 'blackAndWhite',
      variant: 'expanded',
      callbacks: {
        onNoFill: () => {
          console.info('표시할 배너 광고가 없어요.');
        },
        onAdFailedToRender: (payload) => {
          console.error('배너 광고 렌더링 실패:', payload.error.message);
        },
      },
    });

    return () => {
      attached?.destroy();
    };
  }, [isInitialized, attachBanner]);

  if (!AD_GROUP_ID) return null;

  return <div ref={containerRef} style={{ width: '100%', height: '96px' }} />;
}
