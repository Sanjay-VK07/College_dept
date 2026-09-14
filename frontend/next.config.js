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
    ];
  },
};

module.exports = nextConfig;

