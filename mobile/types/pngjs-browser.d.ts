declare module "pngjs/browser" {
  export const PNG: {
    sync: {
      read(input: Uint8Array): {
        width: number;
        height: number;
        data: Uint8Array;
      };
    };
  };
}
