# Vendored noVNC bundle

This directory contains the upstream [noVNC](https://github.com/novnc/noVNC) `core` sources (v1.6.0) plus their `vendor` dependencies. We bundle the entrypoint to an ESM-friendly file (`rfb.mjs`) so that Next.js/Turbopack can load the library on Cloudflare without relying on CommonJS globals such as `exports`.

## Rebuilding `rfb.mjs`

Run the following from the repository root whenever you need to regenerate the bundle (after adjusting the version as needed):

```pwsh
# Download the upstream tarball
if (!(Test-Path tmp)) { New-Item -ItemType Directory -Path tmp | Out-Null }
Invoke-WebRequest -Uri https://codeload.github.com/novnc/noVNC/tar.gz/refs/tags/v1.6.0 -OutFile tmp/novnc-v1.6.0.tgz

# Extract and copy sources
tar -xf tmp/novnc-v1.6.0.tgz -C tmp
Remove-Item -Recurse -Force lib/vendor/novnc/core, lib/vendor/novnc/vendor -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force tmp/noVNC-1.6.0/core lib/vendor/novnc/core
Copy-Item -Recurse -Force tmp/noVNC-1.6.0/vendor lib/vendor/novnc/vendor

# Bundle to ESM
npx esbuild lib/vendor/novnc/core/rfb.js --bundle --format=esm --platform=browser --target=es2022 --outfile=lib/vendor/novnc/rfb.mjs

# Cleanup tmp files as desired
Remove-Item -Recurse -Force tmp/noVNC-1.6.0
Remove-Item -Force tmp/novnc-v1.6.0.tgz
```

> Note: The bundle must remain under the MPL 2.0 license. Keep `LICENSE.txt` alongside the vendored sources.
