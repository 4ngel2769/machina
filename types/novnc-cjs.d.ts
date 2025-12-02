declare module '@/lib/novnc-client' {
  import type RFBType from '@novnc/novnc/lib/rfb.js';
  const RFB: typeof RFBType;
  export default RFB;
}

declare module '@/lib/vendor/novnc/rfb.mjs' {
  import type RFBType from '@novnc/novnc/lib/rfb.js';
  const RFB: typeof RFBType;
  export default RFB;
}
