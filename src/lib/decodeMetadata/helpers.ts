import pako from "pako";
import { ethers } from "ethers";
import { decodeAllSync, encodeCanonical } from "cbor-web";
import type { MetaV1S } from "$lib/types/graphql";
import type { PinnedMetadata } from "$lib/types/PinnedMetadata";

type CborContent = string | ArrayBuffer;

interface CborEncodeOptions {
  contentEncoding?: string;
  schema?: unknown;
  contentLanguage?: string;
}

export const MAGIC_NUMBERS = {
  /**
   * Prefixes every rain meta document
   */
  RAIN_META_DOCUMENT: BigInt(0xff0a89c674ee7874n),
  /**S
   * OA Schema
   */
  OA_SCHEMA: BigInt(0xffa8e8a9b9cf4a31n),
  /**
   * OA Hash list
   */
  OA_HASH_LIST: BigInt(0xff9fae3cc645f463n),
  /**
   * OA Structure
   */
  OA_STRUCTURE: BigInt(0xffc47a6299e8a911n),
  /**
   * OA Token image
   */
  OA_TOKEN_IMAGE: BigInt(0xff8cd2927c8c86cbn),
  /**
   * OA Token credential links
   */
  OA_TOKEN_CREDENTIAL_LINKS: BigInt(0xffbc38eb14ad2209n),
};

export function deflateJson(data_: string | pako.Data) {
  const bytes = Uint8Array.from(pako.deflate(data_));
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex = hex + bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function cborEncode(
  payload_: CborContent,
  magicNumber_: bigint,
  contentType_: string | null,
  options_: CborEncodeOptions | null,
): string {
  const m = new Map();
  m.set(0, payload_); // Payload
  m.set(1, magicNumber_); // Magic number
  if (contentType_) {
    m.set(2, contentType_); // Content-Type
  }

  if (options_) {
    if (options_.contentEncoding) {
      m.set(3, options_.contentEncoding); // Content-Encoding
    }

    if (options_.contentLanguage) {
      m.set(4, options_.contentLanguage); // Content-Language
    }

    if (options_.schema) {
      m.set(MAGIC_NUMBERS.OA_SCHEMA, options_.schema);
    }
  }
  return encodeCanonical(m).toString("hex").toLowerCase();
}

export function encodeCBORStructure(structure: string, schemaHash: string) {
  // -- Encoding with CBOR
  // Obtain (Deflated JSON) and parse it to an ArrayBuffer
  if (typeof structure === "object") {
    structure = JSON.stringify(structure);
  }
  const deflatedBytes = ethers.getBytes(deflateJson(structure));
  const deflatedData = deflatedBytes.buffer as ArrayBuffer;
  return cborEncode(
    deflatedData,
    MAGIC_NUMBERS.OA_STRUCTURE,
    "application/json",
    {
      contentEncoding: "deflate",
      schema: schemaHash,
    },
  );
}

/**
 * Sorts an array based on a specified order.
 *
 * @param {Array<Object>} array - The array to be sorted.
 * @param {string[]} order - An array defining the desired order.
 * @param {string} key - The key in the objects used for sorting.
 * @returns {Array<Object>} - Sorted array.
 */
export function mapOrder<T extends Record<string, unknown>, K extends keyof T>(
  array: T[],
  order: string[],
  key: K,
): T[] {
  array.sort((a, b) => {
    const valueA = a[key];
    const valueB = b[key];
    const indexA = typeof valueA === "string" ? order.indexOf(valueA) : -1;
    const indexB = typeof valueB === "string" ? order.indexOf(valueB) : -1;

    if (indexA > indexB) {
      return 1;
    } else {
      return -1;
    }
  });

  return array;
}

export function bytesToMeta(
  bytes: ArrayBuffer | Uint8Array | string,
  type: string,
): unknown {
  if (ethers.isBytesLike(bytes)) {
    const _bytesArr = ethers.getBytes(bytes);
    let _meta;
    if (type === "json") {
      _meta = pako.inflate(_bytesArr, { to: "string" });
    } else {
      let buffer: Uint8Array;
      if (bytes instanceof Uint8Array) {
        buffer = bytes;
      } else if (typeof bytes === "string") {
        buffer = ethers.getBytes(bytes);
      } else {
        buffer = new Uint8Array(bytes as ArrayBuffer);
      }
      _meta = new TextDecoder().decode(buffer).slice(3);
    }
    let res;
    try {
      res = JSON.parse(_meta);
    } catch {
      res = _meta;
    }
    return res;
  } else {
    throw new Error("Not a valid Bytes string");
  }
}

export function cborDecode(dataEncoded_: ArrayBuffer | Uint8Array | string) {
  return decodeAllSync(dataEncoded_);
}
function getDateValues(date: Date) {
  const d = new Date(date),
    year = d.getFullYear();

  let month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    min = "" + d.getMinutes(),
    hour = "" + d.getHours();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;
  if (min.length < 2) min = "0" + min;
  if (hour.length < 2) hour = "0" + hour;

  return { day, month, year, hour, min };
}

export function formatDate(date: Date) {
  const { year, month, day } = getDateValues(date);
  return [year, month, day].join("-");
}

export function convertDotNotationToObject(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(input)) {
    const value = input[key];
    const keyParts = key.split(".");

    let currentPart = result;
    for (let i = 0; i < keyParts.length; i++) {
      const part = keyParts[i];

      // If we're at the last part, assign the value
      if (i === keyParts.length - 1) {
        currentPart[part] = value;
        break;
      }

      // If the next part doesn't exist or isn't an object, create or overwrite it
      if (!currentPart[part] || typeof currentPart[part] !== "object") {
        currentPart[part] = {};
      }

      // Move our reference down to the next part of the path
      currentPart = currentPart[part] as Record<string, unknown>;
    }
  }

  return result;
}

export function decodeSftInformation(metaV1: MetaV1S): PinnedMetadata | null {
  try {
    // Decode the metadata using the same process as ReceiptMetadata
    const information = metaV1.meta ? cborDecode(metaV1.meta.slice(18)) : null;
    if (!information) {
      return null;
    }

    const structure = bytesToMeta(information[0].get(0), "json");
    const convertedStructure =
      typeof structure === "object" && structure !== null
        ? convertDotNotationToObject(structure as Record<string, unknown>)
        : {};

    // Add additional metadata from the original metaV1
    return {
      ...(convertedStructure as Record<string, unknown>),
      contractAddress: metaV1.subject || metaV1.id,
    } as PinnedMetadata;
  } catch {
    return null;
  }
}
