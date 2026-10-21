/** @type {import('next').NextConfig} */
const backendApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const backendBaseUrl = (process.env.NEXT_PUBLIC_SOCKET_URL || backendApiUrl.replace(/\/api\/?$/, '')).replace(/\/$/, '');

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: backendApiUrl,
    NEXT_PUBLIC_SOCKET_URL: backendBaseUrl,
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${backendBaseUrl}/uploads/:path*`,
      },
      {
        source: '/gate-extraction-v2/:path*',
        destination: `${backendBaseUrl}/gate-extraction-v2/:path*`,
      },
      {
        source: '/images/:path*',
        destination: `${backendBaseUrl}/images/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${backendApiUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

