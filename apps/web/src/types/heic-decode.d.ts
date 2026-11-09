// heic-decode bringt keine Typen mit (genutzt in src/server/media/heic.ts)
declare module "heic-decode" {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray };
  type Lazy = { width: number; height: number; decode(): Promise<Decoded> };
  function decode(input: { buffer: Uint8Array }): Promise<Decoded>;
  namespace decode {
    function all(input: { buffer: Uint8Array }): Promise<Lazy[] & { dispose(): void }>;
  }
  export default decode;
}
