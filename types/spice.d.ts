declare module '@spice-project/spice-html5' {
  export interface SpiceMainConnOptions {
    uri: string;
    screen_id: string;
    password?: string;
    onerror?: (error: Error) => void;
    onsuccess?: () => void;
    ondisconnect?: () => void;
  }

  export class SpiceMainConn {
    constructor(options: SpiceMainConnOptions);
    start(): void;
    stop(): void;
    sendCtrlAltDel(): void;
  }

  export interface SpiceConn {
    uri: string;
  }
}
