import { describe, expect, it, vi } from 'vitest';
import { createFullScreenAdController, type FullScreenAdSdk } from './fullScreenAd';

type LoadParams = Parameters<FullScreenAdSdk['load']>[0];
type ShowParams = Parameters<FullScreenAdSdk['show']>[0];

function createFakeSdk(supported = true) {
  const loads: LoadParams[] = [];
  const shows: ShowParams[] = [];
  const sdk: FullScreenAdSdk = {
    isSupported: () => supported,
    load: vi.fn((params: LoadParams) => {
      loads.push(params);
      return () => {};
    }),
    show: vi.fn((params: ShowParams) => {
      shows.push(params);
      return () => {};
    }),
  };
  return { sdk, loads, shows };
}

const AD_GROUP_ID = 'ait.v2.live.test';

describe('createFullScreenAdController', () => {
  it('preload는 지정한 광고 그룹 ID로 광고를 불러온다', () => {
    const { sdk, loads } = createFakeSdk();
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    ad.preload();

    expect(loads).toHaveLength(1);
    expect(loads[0].options).toEqual({ adGroupId: AD_GROUP_ID });
  });

  it('지원하지 않는 환경에서는 아무것도 호출하지 않는다', () => {
    const { sdk } = createFakeSdk(false);
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    ad.preload();
    ad.showIfReady();

    expect(sdk.load).not.toHaveBeenCalled();
    expect(sdk.show).not.toHaveBeenCalled();
  });

  it('광고 그룹 ID가 없으면 아무것도 호출하지 않는다', () => {
    const { sdk } = createFakeSdk();
    const ad = createFullScreenAdController(sdk, undefined);

    ad.preload();
    ad.showIfReady();

    expect(sdk.load).not.toHaveBeenCalled();
    expect(sdk.show).not.toHaveBeenCalled();
  });

  it('로드가 끝나기 전에는 show하지 않는다', () => {
    const { sdk } = createFakeSdk();
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    ad.preload();
    ad.showIfReady();

    expect(sdk.show).not.toHaveBeenCalled();
  });

  it('로드가 끝난 뒤에는 show한다', () => {
    const { sdk, loads, shows } = createFakeSdk();
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    ad.preload();
    loads[0].onEvent({ type: 'loaded' });
    ad.showIfReady();

    expect(shows).toHaveLength(1);
    expect(shows[0].options).toEqual({ adGroupId: AD_GROUP_ID });
  });

  it('한 번 로드한 광고는 한 번만 보여준다', () => {
    const { sdk, loads } = createFakeSdk();
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    ad.preload();
    loads[0].onEvent({ type: 'loaded' });
    ad.showIfReady();
    ad.showIfReady();

    expect(sdk.show).toHaveBeenCalledTimes(1);
  });

  it('광고를 닫으면 다음 광고를 다시 불러온다', () => {
    const { sdk, loads, shows } = createFakeSdk();
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    ad.preload();
    loads[0].onEvent({ type: 'loaded' });
    ad.showIfReady();
    shows[0].onEvent({ type: 'dismissed' });

    expect(loads).toHaveLength(2);
  });

  it('표시에 실패해도 다음 광고를 다시 불러온다', () => {
    const { sdk, loads, shows } = createFakeSdk();
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    ad.preload();
    loads[0].onEvent({ type: 'loaded' });
    ad.showIfReady();
    shows[0].onEvent({ type: 'failedToShow' });

    expect(loads).toHaveLength(2);
  });

  it('로드에 실패하면 다음 preload에서 다시 시도할 수 있다', () => {
    const { sdk, loads } = createFakeSdk();
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    ad.preload();
    loads[0].onError(new Error('no fill'));
    ad.preload();

    expect(loads).toHaveLength(2);
  });

  it('로드 중에 preload를 또 부르면 중복 요청하지 않는다', () => {
    const { sdk } = createFakeSdk();
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    ad.preload();
    ad.preload();

    expect(sdk.load).toHaveBeenCalledTimes(1);
  });

  describe('노출 간격 제한', () => {
    function setup() {
      const fake = createFakeSdk();
      let time = 0;
      const ad = createFullScreenAdController(fake.sdk, AD_GROUP_ID, { cooldownMs: 60_000, now: () => time });
      const advance = (ms: number) => {
        time += ms;
      };
      // 로드 완료 → show → 실제 화면 표시 → 닫기까지 한 번의 노출 사이클을 돌린다.
      const loadAndShowOnce = () => {
        fake.loads[fake.loads.length - 1].onEvent({ type: 'loaded' });
        ad.showIfReady();
        const show = fake.shows[fake.shows.length - 1];
        show.onEvent({ type: 'show' });
        show.onEvent({ type: 'dismissed' });
      };
      return { ...fake, ad, advance, loadAndShowOnce };
    }

    it('광고가 뜬 뒤 60초 안에는 다시 보여주지 않는다', () => {
      const { ad, sdk, advance, loadAndShowOnce, loads } = setup();
      ad.preload();
      loadAndShowOnce();

      advance(59_999);
      loads[1].onEvent({ type: 'loaded' });
      ad.showIfReady();

      expect(sdk.show).toHaveBeenCalledTimes(1);
    });

    it('60초가 지나면 다시 보여준다', () => {
      const { ad, sdk, advance, loadAndShowOnce, loads } = setup();
      ad.preload();
      loadAndShowOnce();

      advance(60_000);
      loads[1].onEvent({ type: 'loaded' });
      ad.showIfReady();

      expect(sdk.show).toHaveBeenCalledTimes(2);
    });

    it('간격 제한으로 건너뛴 광고는 버리지 않고 다음 기회에 보여준다', () => {
      const { ad, sdk, advance, loadAndShowOnce, loads } = setup();
      ad.preload();
      loadAndShowOnce();
      loads[1].onEvent({ type: 'loaded' });

      advance(30_000);
      ad.showIfReady();
      advance(30_000);
      ad.showIfReady();

      expect(sdk.show).toHaveBeenCalledTimes(2);
      expect(loads).toHaveLength(2);
    });

    it('표시에 실패한 광고는 간격 제한을 걸지 않는다', () => {
      const { ad, sdk, loads, shows } = setup();
      ad.preload();
      loads[0].onEvent({ type: 'loaded' });
      ad.showIfReady();
      shows[0].onEvent({ type: 'failedToShow' });

      loads[1].onEvent({ type: 'loaded' });
      ad.showIfReady();

      expect(sdk.show).toHaveBeenCalledTimes(2);
    });
  });

  it('SDK 호출이 예외를 던져도 앱 흐름을 깨지 않는다', () => {
    const sdk: FullScreenAdSdk = {
      isSupported: () => true,
      load: () => {
        throw new Error('bridge missing');
      },
      show: () => {
        throw new Error('bridge missing');
      },
    };
    const ad = createFullScreenAdController(sdk, AD_GROUP_ID);

    expect(() => ad.preload()).not.toThrow();
    expect(() => ad.showIfReady()).not.toThrow();
  });
});
