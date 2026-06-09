/**
 * Verifier: confirm each baked `deployBlock` in static-orders.json is the
 * EARLIEST add-event block on its orderbook subgraph (not just addEvents[0]).
 * Re-queries the subgraphs and compares min(blockNumber) to the baked value.
 *
 * Run:  node scripts/verify-deploy-blocks.mjs
 */
import { readFileSync } from "node:fs";
import axios from "axios";

const src = readFileSync(new URL("../src/lib/network.ts", import.meta.url), "utf8");
const baked = JSON.parse(
  readFileSync(new URL("./static-orders.json", import.meta.url), "utf8"),
);

function constVal(name) {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\\n?\\s*"([^"]+)"`));
  if (!m) throw new Error(`Could not read const ${name}`);
  return m[1];
}

const SUBGRAPHS = {
  [constVal("ORDERBOOK_CONTRACT_ADDRESS").toLowerCase()]: constVal(
    "BASE_ORDERBOOK_SUBGRAPH_URL",
  ),
  [constVal("ORDERBOOK_V6_CONTRACT_ADDRESS").toLowerCase()]: constVal(
    "BASE_ORDERBOOK_V6_SUBGRAPH_URL",
  ),
};

const QUERY = `
  query($h: [String!]!) {
    orders(where: { orderHash_in: $h }) {
      orderHash
      addEvents { transaction { blockNumber } }
    }
  }
`;

async function gql(url, variables) {
  const r = await axios.post(
    url,
    { query: QUERY, variables },
    { timeout: 30000, headers: { "content-type": "application/json" } },
  );
  if (r.data?.errors) throw new Error(JSON.stringify(r.data.errors));
  return r.data?.data?.orders ?? [];
}

let mismatches = 0;
for (const entry of baked) {
  const url = SUBGRAPHS[entry.orderbook.toLowerCase()];
  if (!url) {
    console.log(`?? no subgraph for orderbook ${entry.orderbook}`);
    continue;
  }
  const orders = await gql(url, { h: [entry.orderHash] });
  const order = orders.find(
    (o) => o.orderHash?.toLowerCase() === entry.orderHash.toLowerCase(),
  );
  if (!order) {
    console.log(`?? ${entry.orderHash.slice(0, 10)} not found on its subgraph`);
    mismatches++;
    continue;
  }
  const blocks = (order.addEvents ?? [])
    .map((ev) => Number.parseInt(ev?.transaction?.blockNumber ?? "", 10))
    .filter((n) => Number.isFinite(n));
  const min = blocks.length ? Math.min(...blocks) : null;
  const ok = min === entry.deployBlock;
  if (!ok) mismatches++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${entry.orderHash.slice(0, 10)}  ` +
      `baked=${entry.deployBlock}  min=${min}  events=[${blocks.join(",")}]`,
  );
}
console.log(`\n${baked.length - mismatches}/${baked.length} baked deployBlocks == earliest add-event block`);
process.exit(mismatches ? 1 : 0);
