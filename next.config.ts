import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingExcludes: {
    "*": ["./reference/**"],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      const veiligstallenApp = path.resolve(__dirname, "../fietsberaad-veiligstallen-app");
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/reference/**",
          "**/node_modules/**",
          veiligstallenApp,
          `${veiligstallenApp}/**`,
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
