import type { MetaV1S } from "$lib/types/sftMetadataTypes";
import { BASE_METADATA_SUBGRAPH_URL, ENERGY_FIELDS } from "$lib/network";
import { PUBLIC_METABOARD_ADMIN } from '$env/static/public';

const METABOARD_ADMIN = PUBLIC_METABOARD_ADMIN || "0x0000000000000000000000000000000000000000";
export const getSftMetadata = async (): Promise<MetaV1S[]> => {
  try {
    // Extract all SFT addresses from ENERGY_FIELDS
    const sftAddresses = ENERGY_FIELDS.flatMap((field) =>
      field.sftTokens.map((token) => token.address),
    );

    // Create the subjects array for the GraphQL query
    const subjects = sftAddresses.map(
      (address) => `"0x000000000000000000000000${address.slice(2)}"`,
    );

    const query = `
    {
  metaV1S(where: {
    subject_in: [${subjects.join(",")}],
    sender: "${METABOARD_ADMIN.toLowerCase()}"
  },
  orderBy: transaction__timestamp
  orderDirection: desc
   first: ${subjects.length}
  ) {
    id
    meta
    sender
    subject
    metaHash
  }
}
    `;

    const response = await fetch(BASE_METADATA_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const json = await response.json();

    return json.data.metaV1S as MetaV1S[];
  } catch (error) {
    console.error("Error fetching metadata:", error);
    throw error;
  }
};
