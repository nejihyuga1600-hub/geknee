import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "*.wikimedia.org" },
    ],
  },
  // The dev panel HMR chip overlaps the bottom-right of any full-viewport
  // canvas, which contaminates monument snapshots. Set NEXT_DISABLE_DEV_INDICATOR=1
  // before `npm run dev` when running bin/snap-monuments.mjs to suppress it.
  devIndicators: process.env.NEXT_DISABLE_DEV_INDICATOR === "1" ? false : undefined,
  // Vercel's serverless function size limit (~250MB unzipped) was getting
  // tripped by Prisma's bundled query engines + compilers for every
  // database it ships (MySQL, SQL Server, SQLite, CockroachDB, plus the
  // postgresql native + WASM variants). We only use Postgres on Neon —
  // exclude everything else from output tracing so it doesn't ship in
  // the lambda. Also drops the Windows native binary (we deploy to
  // Linux) and any orphaned .tmp files left behind by concurrent
  // `prisma generate` calls during local dev.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@prisma/client/runtime/query_engine_bg.cockroachdb*',
      'node_modules/@prisma/client/runtime/query_engine_bg.mysql*',
      'node_modules/@prisma/client/runtime/query_engine_bg.sqlserver*',
      'node_modules/@prisma/client/runtime/query_engine_bg.sqlite*',
      'node_modules/@prisma/client/runtime/query_compiler_bg.cockroachdb*',
      'node_modules/@prisma/client/runtime/query_compiler_bg.mysql*',
      'node_modules/@prisma/client/runtime/query_compiler_bg.sqlserver*',
      'node_modules/@prisma/client/runtime/query_compiler_bg.sqlite*',
      'node_modules/.prisma/client/query_engine-windows*',
      'node_modules/.prisma/client/*.tmp*',
      'node_modules/@prisma/engines/query-engine-windows*',
    ],
  },
  async redirects() {
    return [
      // Legacy preference-collection route. The 2,085-line client UI in
      // app/plan/style/page.tsx was superseded by the AtlasShell flow;
      // nothing in the app links to it. Inbound bookmarks/share links
      // land on the live planner instead.
      { source: '/plan/style', destination: '/plan/location', permanent: true },
    ];
  },
};

export default nextConfig;
