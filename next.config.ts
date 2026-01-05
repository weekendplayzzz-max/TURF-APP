import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  register: false, // Manual registration for more control
  skipWaiting: true,
  disable: false,
  sw: 'sw.js',
  scope: '/',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-cache',
        expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 }
      }
    }
  ]
});

export default withPWA({
  reactStrictMode: true
});
