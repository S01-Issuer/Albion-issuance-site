// Minimal shim to satisfy SSR build; not used at runtime in prod
export const AbiCoder = {
  defaultAbiCoder: () => ({
    decode: () => [],
  }),
} as any;
export const ethers = {
  getBytes: (value: any) => {
    // Simple implementation for test purposes
    if (typeof value === "string" && value.startsWith("0x")) {
      const hex = value.slice(2);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return bytes;
    }
    if (value instanceof Uint8Array) {
      return value;
    }
    return new Uint8Array();
  },
  isBytesLike: (value: any) => {
    // Check if value is bytes-like (Uint8Array, hex string, etc.)
    if (value instanceof Uint8Array) return true;
    if (typeof value === "string" && value.startsWith("0x")) return true;
    if (value && typeof value === "object" && "buffer" in value) return true;
    return false;
  },
  AbiCoder,
} as any;
export const Signature = {} as any;
export const Wallet = {
  createRandom: () => ({
    address: "0x0",
    signingKey: { sign: () => ({ r: "0x", s: "0x", v: 27 }) },
  }),
} as any;
export const keccak256 = () => "0x";
export const hashMessage = () => "0x";
export const getBytes = ethers.getBytes;
export const isBytesLike = ethers.isBytesLike;
export const concat = (...args: any[]) => new Uint8Array();
export default { ethers } as any;
export const WebSocket = class {} as any;
