// Minimal shim to satisfy SSR build; not used at runtime in prod

type HexLike = string | Uint8Array | { buffer: ArrayBufferLike };

const toBytes = (value: HexLike): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (typeof value === "string" && value.startsWith("0x")) {
    const hex = value.slice(2);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }

  if (value && typeof value === "object" && "buffer" in value) {
    const buffer = (value as { buffer: ArrayBufferLike }).buffer;
    return new Uint8Array(buffer);
  }

  return new Uint8Array();
};

const isBytesLikeValue = (value: unknown): value is HexLike => {
  if (value instanceof Uint8Array) return true;
  if (typeof value === "string" && value.startsWith("0x")) return true;
  if (value && typeof value === "object" && "buffer" in value) return true;
  return false;
};

const abiCoder = {
  decode: () => [] as unknown[],
};

export const AbiCoder = {
  defaultAbiCoder: () => abiCoder,
};

export const ethers = {
  getBytes: toBytes,
  isBytesLike: isBytesLikeValue,
  AbiCoder,
};

export interface SimpleSignature {
  r: string;
  s: string;
  v: number;
}

export const Signature: SimpleSignature = { r: "0x", s: "0x", v: 27 };

export const Wallet = {
  createRandom: () => ({
    address: "0x0",
    signingKey: {
      sign: (): SimpleSignature => ({ ...Signature }),
    },
  }),
};

export const keccak256 = () => "0x";
export const hashMessage = () => "0x";
export const getBytes = ethers.getBytes;
export const isBytesLike = ethers.isBytesLike;
export const concat = (...arrays: Uint8Array[]): Uint8Array => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
};

export default { ethers } satisfies { ethers: typeof ethers };

export class WebSocket {}
