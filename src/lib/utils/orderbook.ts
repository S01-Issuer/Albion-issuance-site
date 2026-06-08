import { AbiCoder, hexlify } from "ethers";
import type { OrderV4 } from "@rainlanguage/orderbook";

const IOV2 = "(address token, bytes32 vaultId)";
const EvaluableV4 = "(address interpreter, address store, bytes bytecode)";
export const OrderV4_ABI = `(address owner, ${EvaluableV4} evaluable, ${IOV2}[] validInputs, ${IOV2}[] validOutputs, bytes32 nonce)`;

function toSdkHex(value: string | Uint8Array | ArrayLike<number>): string {
  if (typeof value === "string") {
    return value.startsWith("0x") ? value : `0x${value}`;
  }
  if (value instanceof Uint8Array) {
    return hexlify(value);
  }
  return hexlify(Uint8Array.from(value));
}

/** Ethers decodes ABI tuples as array-like Result; getTakeOrders3Calldata needs plain objects. */
function normalizeEvaluable(
  evaluable: OrderV4["evaluable"] | unknown[],
): OrderV4["evaluable"] {
  const ev = evaluable as OrderV4["evaluable"] & {
    0?: string;
    1?: string;
    2?: Uint8Array;
  };
  const interpreter = ev.interpreter ?? ev[0];
  const store = ev.store ?? ev[1];
  const bytecode = ev.bytecode ?? ev[2];
  if (!interpreter || !store || bytecode === undefined) {
    throw new Error("Invalid order evaluable: missing interpreter, store, or bytecode");
  }
  return {
    interpreter: String(interpreter),
    store: String(store),
    bytecode: toSdkHex(bytecode as string | Uint8Array),
  };
}

function normalizeIo(
  io: { token: string; vaultId: string | Uint8Array } & {
    0?: string;
    1?: unknown;
  },
) {
  return {
    token: String(io.token ?? io[0]),
    vaultId: toSdkHex((io.vaultId ?? io[1]) as string | Uint8Array),
  };
}

/** Plain OrderV4 for Rain SDK / getTakeOrders3Calldata. */
export function normalizeOrderForSdk(order: OrderV4): OrderV4 {
  const raw = order as OrderV4 & {
    0?: string;
    1?: OrderV4["evaluable"];
    2?: OrderV4["validInputs"];
    3?: OrderV4["validOutputs"];
    4?: string | Uint8Array;
  };
  const owner = raw.owner ?? raw[0];
  const evaluable = normalizeEvaluable(raw.evaluable ?? raw[1]!);
  const validInputs = (raw.validInputs ?? raw[2] ?? []).map(normalizeIo);
  const validOutputs = (raw.validOutputs ?? raw[3] ?? []).map(normalizeIo);
  const nonce = raw.nonce ?? raw[4];

  return {
    owner: String(owner),
    evaluable,
    validInputs,
    validOutputs,
    nonce: toSdkHex(nonce as string | Uint8Array),
  };
}

export function decodeOrderBytes(orderBytes: string): OrderV4 {
  const [order] = AbiCoder.defaultAbiCoder().decode([OrderV4_ABI], orderBytes);
  return normalizeOrderForSdk(order as OrderV4);
}
