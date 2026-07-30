/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${process.env.BACKEND_BASE_URL ?? 'http://localhost:4100'}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
