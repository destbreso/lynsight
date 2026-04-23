/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship as TS source; let Next transpile them.
  transpilePackages: [
    '@lynsight/parser',
    '@lynsight/core',
    '@lynsight/llm',
    '@lynsight/reports',
  ],
  experimental: {
    // Allow uploading large lynis bundles to the route handler.
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // Workspace packages use ESM-style `.js` import specifiers that resolve to
  // `.ts` source files in dev. Webpack does not do this by default — Node and
  // Bundler tsconfig moduleResolution do. Map `.js` → `.ts`/`.tsx` so Next can
  // load the workspace source directly without a build step.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
