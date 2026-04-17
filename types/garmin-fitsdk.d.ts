declare module "@garmin/fitsdk" {
  export class Stream {
    static fromByteArray(bytes: Uint8Array): Stream;
  }

  export class Decoder {
    constructor(stream: Stream);
    isFIT(): boolean;
    checkIntegrity(): boolean;
    read(options?: Record<string, unknown>): {
      messages: Record<string, unknown>;
      errors: unknown[];
    };
  }
}
