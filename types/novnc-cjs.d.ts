declare module '@/lib/novnc-cjs' {
  import type RFBType from '@novnc/novnc/lib/rfb.js';
  const RFB: typeof RFBType;
  export default RFB;
}
