import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keeps Next from writing agent instruction files into the repo.
  agentRules: false,
  turbopack: {
    // Stated explicitly because the API package above this one has its own
    // lockfile, and Next would otherwise infer the wrong root.
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
};

export default nextConfig;
