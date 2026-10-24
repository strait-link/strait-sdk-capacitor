// Bundles src/app.js into www/build/app.js. Your key and link domain come from the environment,
// so they never land in git:  STRAIT_PUBLISHABLE_KEY=st_pub_live_… STRAIT_ENDPOINT=https://<handle>.strait.link npm run build
import { build } from 'esbuild';

await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'www/build/app.js',
  define: {
    STRAIT_PUBLISHABLE_KEY: JSON.stringify(process.env.STRAIT_PUBLISHABLE_KEY || 'st_pub_live_REPLACE_ME'),
    STRAIT_ENDPOINT: JSON.stringify(process.env.STRAIT_ENDPOINT || 'https://strait-dev.strait.link'),
  },
});
