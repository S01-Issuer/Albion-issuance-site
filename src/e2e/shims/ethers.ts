// Minimal shim to satisfy SSR build; not used at runtime in prod
export const AbiCoder = { defaultAbiCoder: { decode: () => [] } } as any;
export const ethers = {
  getBytes: () => new Uint8Array(),
  AbiCoder,
} as any;
export const Signature = {} as any;
export const Wallet = { createRandom: () => ({ address: '0x0', signingKey: { sign: () => ({ r: '0x', s: '0x', v: 27 }) } }) } as any;
export const keccak256 = () => '0x';
export const hashMessage = () => '0x';
export const getBytes = () => new Uint8Array();
export const concat = (...args: any[]) => new Uint8Array();
export default { ethers } as any;
export const WebSocket = class {} as any;