import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'anytime-pharmacy',
  brand: {
    primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
  },
  navigationBar: {
    withBackButton: false,
  },
  permissions: [{ name: 'geolocation', access: 'access' }],
  webBundleDir: 'dist',
});
