// Reusable HTTP-level fetch mock for subgraph and IPFS endpoints

import axios from "axios";

const REAL_WRESSLE_CBOR =
  "ff0a89c674ee7874a500590847789ca558db6ee4b811fd154249dedc32458992da79ea197b13239e1dc37632982c060bb6c46ed12d891a8aea8b077e4f7e73bf64aba4b6dd1615ec430003332d1ed6ed541559fce1fdb9cd0a5909efc22bac6d2ececf1f5b5dcf868fbe36ebf3dc88959dd1e47cf8f627efcccb746d8dc8ec22cf8d6c5bd84bf7ab348c05a7741ed088878b709ed0345a5cca2808592025a3822f16b90c60bb685b69af73d8f6e5eeeafefee66a16ccee3e7f5ddc3c7c9d453e07447ba896ba04c0e2e6c3eccb1d2ce33e234b295af9b3a8242c7dd455d5d5ca1ec8ad915b25770431566f64fd70681061f44194f6005f57cab4f6561c2a59db4b61719151c667b4575608236fa5c96051ac618df9fccccb65a62a518273410a98ae69ca8377f1c3abc4fefef8c30b18a5142454aab6327ffd4cbde733af1107dda13208ed2fdf8e4ea380fe3f471fbe60f84a390b08f8fd177237184ceead91a2f2d0883633aab14ad780fe5cb785369240f8b7602b7c1425d1aa242b25cb9cd45218729f75b5055423cfc8cfdad882dca83ad3256c5506be3546e75da6ea3529d5bab0e4830149b352d51b9993cc74b9242ba32b620b4916a06e2b0df99b519680a5d26cb5323ed855ea4c0c46fdf05a3b04f44ab4967c527929eabced93042cc1709c1af0f2dde0c23f813dd0fa0fb026d755bfa44dae6a90d7a2e45240c078e87320a0acd7dec58cfa3c8a20b83b80984bd9d8c2bba0f05b37d208ab0deeaa87d05e81cc9adcc95677c02c1ab493cb56f5a662a6b790eabbddce97889b99179c9ff596c83d4854b2cee457882a58c35250636556d42a1325eae9837eccb48fa78c7c56654f5d6f5d90520ad62b48ae1691b7579737f0ed7cf897bde426eee9733298514c6355af0cc4d37499ed0ceefbfbe5ed15d204f11a28446504fd39230843fa3015c070609d0007a4012610bf16edcbe746351285a087f556195d6345a03fde4f5d5902c9ebaec4401e20c9aaa6540222f05702a5aeb692bc55dc8d120ada046486ee9a63b832e0f2aacedfca2b9905e85f9f541f20944525cc0696fa948385c6284c448ce5f265194ab9525d0554077e080137a26ed1f28fbab5edc0b56c2d142628bb512bf9093a51010b217b3e96d88334559f3d589340ab3d5274f7da0c448519e85d4458e6c38f07ad4bab1a6c381085baab96d2b404d27f57934280eba2848acc0f6429654d44fed8b598b92b6dfa4239361ad2bc36919e00231bac9adaf6a05a022dbdb696407310cb5212ab49dfb048a1cb1c547a7ddf404e7e32f27b0751395c8a03fa879ebf118ffe659de90379e1fdf6dfff041159ea26c76e06e5d8614b7ead74f888acf541391511604785b4ed203cc133ca1f12e6f69d1a48aa5b204a2edab6ab8e9d2886c0b9df3ff606657d65df5ff604eb47d90b02ddbf40eb44b2deb5de5373c228f193f8f96c8c8bc7b890fa69ca5d60e200639f452e2e9d1018071302e7636010f9b12b30a00e6eee27cc15180463208dc0c209207380cc775c8e8756718a63738821737163798c333f4e26048663604a7d9abab868840b30d663f2e20992c1c0c0094d3cc532c47002e790cc529fce27800ecb94fb810b7338a6d078dc084e709cf874c291098e133f8e27800ec70168e6636032417212faf371ac930992590047a78b733866733f18a775e272cc20ad438793c42599317079ca9331c90c833861e19864c4255302c724331aba7592b82c0769e44713021d9a8324996836894b73c0e77eea06d16139e001e4cdf33768b7856ae1a4c5ebc469c77ddf27991b8c80f289bec6dc60cc214f2660e358cc93d84fc7e9c4dc50cc93d44fc664313712d11cbae404ce89040581e3c8866eba0701b482287181ae400e253eaef1d04d780086ae2be14457a33c9a048e333ea031f79d220fdd8cef81740238663985d3908dfb5038d1d6a078f944709cbee6bbc21c8aa90b19b311436d3337c60ebb31f451e7648b5c76d310923474718ebc084efd09dc98db780ecd6ccc58e452cbe120a2e3ea885c6639836c1e872e72898d52685113f2c6bc72f077ca8f31af9c856e538e5c5e391c2fdcb5cfa136023fe8b8caa389ea85fee4d45034715ac1b91b4fdcd69ce32f01bd7317379607dd78f2f637e6370ab95b91dce537a2d05cc67e4cdc3a23f0032e2edff02e9c4918b5dbe3c83eb5b11f3086f51f13524eeed3219dcfd93017c1dc8793cb990703c0354cc2d5cbf233e245a95abc72c34dfaf4b6ed5d24b01d26b7e32f4886e7e9abf1ffb429846322e52736314e237a6a135cc4d83bb35898a4e91f98451db3bebdccdffdf8fb495a58eb878d0ec682aadfdf9cbcaeccfbb90b27121c5286052405e66d8d6f4225ccbdbf86f4d71c071f302617aa3cbc9f495e471fb832cd614a14668d6f2b01c55f47c94b2d7177d1ca138b549da97c98aee43058e1700e0aaf8f0bef1e87e092c61f28bde8fffe8db39558497bb8034f716cf5aef6992c4b3404a7a75c671d4e6eedf0de93e1d3c975d5bbec2dc5eab0946abdc99a2a6c373adeaf9e84129d5a9b7db22cf27abfe39b7ca3785eb65d971d3abb8db69b9d966b7c8c580bd0620ebdb06192b2ca9628f71ee67ff21914e1fb17cedae2e5ade85ff820a657fde4f9f6cab412992a553f0577a6fc3f0dc37c7c31e40b04a28009f954f0c64825f6d2aaa764fbf4b45c6e57fb7299adf7b1e48d5cb50c26e6ef4bf3b8514963d47af99deb5c8a0d8fdef9f166fbab8a53bd7d00aeebb619e6cc775b61f0c7cb15d969b38164226298c3fb37a09199cb5ced64b22e9eb8e562a7235ec692252a29d671cd9fa25aa9aa588bc3ae5e6da2e6bb88973aab1c3b66ec9dfa45ad419d21db1326a674af368d880ab92d5bd3681985a660a6ddcb43bdca74a31f9b47c66d138a7c5d558d786c934dbe02dd7881aca415f9b1f233a8592bf3857d1b73e1ef818643f6fa74c8e0aec9ff18f6fcfc3b7b1ff5cd011bffc47a6299e8a91102706170706c69636174696f6e2f6a736f6e03676465666c6174651bffa8e8a9b9cf4a31783b6261666b7265696365636e783267766e746d3666626372766e63333336717a6536737435753771713734353769676567616d6433627a6b78377269a200783b6261666b7265696365636e783267766e746d3666626372766e63333336717a6536737435753771713734353769676567616d6433627a6b78377269011bff9fae3cc645f463";

export type SftMockData = {
  address: string;
  name: string;
  symbol: string;
  totalShares: string;
  metadata?: any;
};

export type HttpMockConfig = {
  sftSubgraphUrl: string;
  metadataSubgraphUrl: string;
  orderbookSubgraphUrl: string;
  ipfsGateway: string;
  wallet: string;
  address: string; // Keep for backward compatibility
  orderHash: string;
  csvCid: string;
  hypersyncUrl?: string;
  sfts?: SftMockData[]; // Optional array of SFT data
};

export function installHttpMocks(cfg: HttpMockConfig) {
  const originalFetch = globalThis.fetch;
  const originalAxiosPost = axios.post;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method || "GET";

    // Debug logging for test mode
    if ((import.meta as any).env?.MODE === "test") {
      console.log("Mock fetch intercepted:", method, url);
    }

    // Mock AlphaVantage API for commodity prices
    if (url.startsWith("https://www.alphavantage.co/query")) {
      const urlObj = new URL(url);
      const func = urlObj.searchParams.get("function");

      // Create mock response based on function type
      const mockData: any = {
        WTI: {
          name: "WTI Crude Oil Prices",
          interval: "daily",
          unit: "$/barrel",
          data: [
            { date: "2025-08-27", value: "81.54" },
            { date: "2025-08-26", value: "79.91" },
            { date: "2025-08-25", value: "80.25" },
          ],
        },
        BRENT: {
          name: "Brent (Europe) Crude Oil Prices",
          interval: "daily",
          unit: "$/barrel",
          data: [
            { date: "2025-08-27", value: "85.63" },
            { date: "2025-08-26", value: "84.11" },
            { date: "2025-08-25", value: "84.50" },
          ],
        },
        NATURAL_GAS: {
          name: "Henry Hub Natural Gas Spot Price",
          interval: "daily",
          unit: "$/mmBtu",
          data: [
            { date: "2025-08-27", value: "2.15" },
            { date: "2025-08-26", value: "2.08" },
            { date: "2025-08-25", value: "2.10" },
          ],
        },
      };

      const response = mockData[func as string] || {
        "Error Message":
          "Invalid API call. Please retry or visit the documentation for WTI, BRENT, NATURAL_GAS.",
        Note: "Thank you for using Alpha Vantage!",
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // CSV file from IPFS - Using Wressle production values
    if (url.startsWith(`${cfg.ipfsGateway}/`) && url.includes(cfg.csvCid)) {
      // May: $347.76, June: $330.885 from Wressle projections
      // Note: amounts are in wei (18 decimals)
      const csv = `index,address,amount\n0,${cfg.wallet.toLowerCase()},347760000000000000000\n1,${cfg.wallet.toLowerCase()},330885000000000000000\n2,0x2222222222222222222222222222222222222222,336240000000000000000`;
      return new Response(csv, {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      });
    }

    // Second CSV file from IPFS - for other claims
    if (
      url.startsWith(`${cfg.ipfsGateway}/`) &&
      url.includes("bafkreiothercsvfile")
    ) {
      const csv = `index,address,amount\n0,${cfg.wallet.toLowerCase()},250000000000000000000\n1,${cfg.wallet.toLowerCase()},180000000000000000000\n2,0x3333333333333333333333333333333333333333,150000000000000000000`;
      return new Response(csv, {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      });
    }

    // Token metadata from IPFS - for any metadata requests
    if (
      url.startsWith(`${cfg.ipfsGateway}/`) &&
      (url.includes("QmWressleMetadata") || url.includes("QmGulfMetadata"))
    ) {
      // Determine which metadata to return based on URL
      const isGulf = url.includes("QmGulfMetadata");

      const metadata = isGulf
        ? {
            name: "Gulf Deep Water 3% Royalty",
            symbol: "ALB-GDW-R1",
            contractAddress: "0xa111111111111111111111111111111111111111",
            attributes: {
              sharePercentage: 3.0,
              oilPriceAssumption: 70,
              benchmarkPremium: 2.5,
              baseReturn: 15.0,
              bonusReturn: 2500.0,
              location: "Gulf of Mexico, United States",
              operator: "Offshore Energy Corp",
              status: "Producing",
              benchmark: "WTI",
              commodity: "Oil",
              paymentFrequency: "30 days",
              breakEvenOilPrice: 8.5,
              impliedBarrelsPerToken: 0.18,
              transportCosts: 2.5,
              plannedProduction: {
                oilPriceAssumption: 70,
                oilPriceAssumptionCurrency: "USD",
                projections: [
                  { month: "2025-05", production: 450.0, revenue: 0 },
                  { month: "2025-06", production: 445.0, revenue: 0 },
                  { month: "2025-07", production: 440.0, revenue: 0 },
                ],
              },
            },
          }
        : {
            name: "Wressle-1 4.5% Royalty Stream",
            symbol: "ALB-WR1-R1",
            contractAddress: cfg.address,
            attributes: {
              sharePercentage: 2.5, // 2.5% royalty from actual Wressle data
              oilPriceAssumption: 65, // Exact value from Wressle data
              benchmarkPremium: -1.3, // Actual Wressle benchmark discount
              baseReturn: 12.04, // Calculated exact base return
              bonusReturn: 3472.2, // Calculated exact bonus return with 1500 minted
              location: "Lincolnshire, United Kingdom",
              operator: "Egdon Resources",
              status: "Producing",
              benchmark: "Brent",
              commodity: "Oil",
              paymentFrequency: "30 days",
              breakEvenOilPrice: 6.94,
              impliedBarrelsPerToken: 0.144,
              transportCosts: 0,
              plannedProduction: {
                oilPriceAssumption: 65,
                oilPriceAssumptionCurrency: "USD",
                projections: [
                  // Exact production data from wressle-r1.json
                  { month: "2025-05", production: 347.76, revenue: 0 },
                  { month: "2025-06", production: 330.885, revenue: 0 },
                  { month: "2025-07", production: 336.24, revenue: 0 },
                  { month: "2025-08", production: 330.615, revenue: 0 },
                  { month: "2025-09", production: 314.64, revenue: 0 },
                  { month: "2025-10", production: 319.725, revenue: 0 },
                  { month: "2025-11", production: 304.245, revenue: 0 },
                  { month: "2025-12", production: 302.85, revenue: 0 },
                  { month: "2026-01", production: 297.72, revenue: 0 },
                  { month: "2026-02", production: 252.675, revenue: 0 },
                  { month: "2026-03", production: 280.08, revenue: 0 },
                  { month: "2026-04", production: 136.26, revenue: 0 },
                  { month: "2026-05", production: 397.125, revenue: 0 },
                  { month: "2026-06", production: 339.75, revenue: 0 },
                  { month: "2026-07", production: 328.095, revenue: 0 },
                  { month: "2026-08", production: 305.1, revenue: 0 },
                  { month: "2026-09", production: 301.32, revenue: 0 },
                  { month: "2026-10", production: 317.025, revenue: 0 },
                  { month: "2026-11", production: 307.665, revenue: 0 },
                  { month: "2026-12", production: 311.355, revenue: 0 },
                  { month: "2027-01", production: 273.96, revenue: 0 },
                  { month: "2027-02", production: 221.58, revenue: 0 },
                  { month: "2027-03", production: 229.14, revenue: 0 },
                  { month: "2027-04", production: 219.375, revenue: 0 },
                  { month: "2027-05", production: 227.655, revenue: 0 },
                  { month: "2027-06", production: 217.08, revenue: 0 },
                  { month: "2027-07", production: 217.755, revenue: 0 },
                  { month: "2027-08", production: 203.85, revenue: 0 },
                  { month: "2027-09", production: 184.455, revenue: 0 },
                  { month: "2027-10", production: 177.885, revenue: 0 },
                  { month: "2027-11", production: 159.84, revenue: 0 },
                  { month: "2027-12", production: 225.78, revenue: 0 }, // Fixed the last month value
                ],
              },
            },
          };
      return new Response(JSON.stringify(metadata), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Subgraph POST endpoints
    if (method.toUpperCase() === "POST") {
      try {
        const body = typeof init?.body === "string" ? init!.body : "";
        const query = body;

        // SFT subgraph
        if (url === cfg.sftSubgraphUrl) {
          // Default to vaults response for test queries
          if (
            query.includes("depositWithReceipts") ||
            query.includes("depositWithReceipt")
          ) {
            const data = {
              data: {
                depositWithReceipts: [
                  {
                    id: "dep1",
                    amount: "1500000000000000000", // 1.5 tokens
                    caller: { address: cfg.wallet.toLowerCase() },
                    offchainAssetReceiptVault: {
                      id: cfg.address.toLowerCase(),
                      name: "Wressle-1 4.5% Royalty Stream",
                      symbol: "ALB-WR1-R1",
                    },
                  },
                ],
              },
            };
            return jsonRes(data);
          }
          if (query.includes("offchainAssetReceiptVaults")) {
            // Use provided SFTs array or default to single SFT for backward compatibility
            const sftVaults = cfg.sfts
              ? cfg.sfts.map((sft) => ({
                  id: sft.address,
                  totalShares: sft.totalShares,
                  sharesSupply: sft.totalShares,
                  address: sft.address,
                  deployer: cfg.wallet,
                  admin: cfg.wallet,
                  name: sft.name,
                  symbol: sft.symbol,
                  deployTimestamp: `${Math.floor(Date.now() / 1000)}`,
                  receiptContractAddress: sft.address,
                  tokenHolders: [
                    {
                      address: cfg.wallet,
                      balance: "1500000000000000000", // 1.5 tokens
                    },
                  ],
                  shareHolders: [],
                  shareTransfers: [],
                  receiptBalances: [],
                  certifications: [],
                  receiptVaultInformations: [],
                  deposits: [],
                  withdraws: [],
                  activeAuthorizer: {
                    address: cfg.wallet,
                    rolesGranted: [],
                    roleHolders: [],
                    roles: [],
                    roleRevokes: [],
                  },
                }))
              : [
                  // Default single SFT for backward compatibility
                  {
                    id: cfg.address,
                    totalShares: "1500000000000000000000",
                    sharesSupply: "1500000000000000000000",
                    address: cfg.address,
                    deployer: cfg.wallet,
                    admin: cfg.wallet,
                    name: "Wressle-1 4.5% Royalty Stream",
                    symbol: "ALB-WR1-R1",
                    deployTimestamp: `${Math.floor(Date.now() / 1000)}`,
                    receiptContractAddress: cfg.address,
                    tokenHolders: [
                      {
                        address: cfg.wallet,
                        balance: "1500000000000000000", // 1.5 tokens
                      },
                    ],
                    shareHolders: [],
                    shareTransfers: [],
                    receiptBalances: [],
                    certifications: [],
                    receiptVaultInformations: [],
                    deposits: [],
                    withdraws: [],
                    activeAuthorizer: {
                      address: cfg.wallet,
                      rolesGranted: [],
                      roleHolders: [],
                      roles: [],
                      roleRevokes: [],
                    },
                  },
                ];

            const data = {
              data: {
                offchainAssetReceiptVaults: sftVaults,
              },
            };
            return jsonRes(data);
          }
          // Default response for any other SFT query (like 'test')
          const defaultData = {
            data: {
              vaults: [
                {
                  id: cfg.address,
                  sharesSupply: "1500000000000000000000", // 1500 tokens minted
                  totalShares: "1500000000000000000000", // 1500 tokens in wei
                  name: "Wressle-1 4.5% Royalty Stream",
                  symbol: "ALB-WR1-R1",
                },
              ],
            },
          };
          return jsonRes(defaultData);
        }

        // Metadata subgraph
        if (url === cfg.metadataSubgraphUrl) {
          if (query.includes("metaV1S")) {
            // Parse the query to check if it's filtering by sender
            // The query can have either escaped quotes or plain quotes
            const senderMatch = query.match(
              /sender:\s*(?:\\")?"?([^\\",\s}]+)"?(?:\\")?/,
            );
            const requestedSender = senderMatch
              ? senderMatch[1].toLowerCase()
              : null;

            // Debug logging
            if ((import.meta as any).env?.MODE === "test") {
              console.log("Metadata query sender:", requestedSender);
              console.log("Config sfts:", cfg.sfts);
              if (cfg.sfts && cfg.sfts.length > 0) {
                console.log(
                  "First SFT address:",
                  cfg.sfts[0].address.toLowerCase(),
                );
              }
            }

            // For testing: return metadata regardless of sender when using test wallet
            // This allows tests to work even if PUBLIC_METABOARD_ADMIN isn't set properly
            const isTestWallet =
              cfg.wallet.toLowerCase() ===
              "0x1111111111111111111111111111111111111111";

            // Only create metadata for the address that matches the CBOR data
            // The CBOR contains the contract address embedded in it: 0xf836a500910453a397084ade41321ee20a5aade1
            // In test mode with test wallet, always return metadata for this address
            const shouldReturnMetadata =
              cfg.sfts &&
              cfg.sfts.length > 0 &&
              cfg.sfts[0].address.toLowerCase() ===
                "0xf836a500910453a397084ade41321ee20a5aade1";

            if ((import.meta as any).env?.MODE === "test") {
              console.log("Should return metadata:", shouldReturnMetadata);
            }

            let metadataEntries =
              shouldReturnMetadata && cfg.sfts
                ? [
                    {
                      id: `meta-1`,
                      meta: `0x${REAL_WRESSLE_CBOR}`, // CBOR data from production (for Wressle only)
                      subject: `0x000000000000000000000000${cfg.sfts[0].address.slice(2).toLowerCase()}`,
                      metaHash: `0x1234`,
                      sender: cfg.wallet.toLowerCase(),
                    },
                  ]
                : cfg.sfts
                  ? []
                  : [
                      // Default single metadata for backward compatibility
                      {
                        id: "meta-1",
                        meta: `0x${REAL_WRESSLE_CBOR}`, // CBOR data from production
                        subject: `0x000000000000000000000000${cfg.address.slice(2).toLowerCase()}`,
                        metaHash: "0x1234",
                        sender: cfg.wallet.toLowerCase(),
                      },
                    ];

            // Filter by sender if requested (skip filtering in test mode with test wallet)
            if (
              !isTestWallet &&
              requestedSender &&
              requestedSender !== cfg.wallet.toLowerCase()
            ) {
              // If sender doesn't match our wallet, return empty array
              metadataEntries = [];
            }

            if ((import.meta as any).env?.MODE === "test") {
              console.log(
                "Returning metadata entries count:",
                metadataEntries.length,
              );
              if (metadataEntries.length > 0) {
                console.log("First entry subject:", metadataEntries[0].subject);
              }
            }

            const data = {
              data: {
                metaV1S: metadataEntries,
              },
            };
            return jsonRes(data);
          }
          // Default response for any other metadata query
          const defaultMetaData = {
            data: {
              metaV1S: [
                {
                  metaURI: "QmWressleMetadata",
                  data: JSON.stringify({
                    name: "Wressle-1 4.5% Royalty Stream",
                    symbol: "ALB-WR1-R1",
                  }),
                },
              ],
            },
          };
          return jsonRes(defaultMetaData);
        }

        // Orderbook subgraph
        if (url === cfg.orderbookSubgraphUrl) {
          if (query.includes("trades")) {
            const data = {
              data: {
                trades: [
                  {
                    order: { orderBytes: "0x", orderHash: cfg.orderHash },
                    orderbook: { id: "0xorderbook" },
                    tradeEvent: {
                      transaction: {
                        id: "0xtrx",
                        blockNumber: 100,
                        timestamp: 1700000000,
                      },
                      sender: cfg.wallet,
                    },
                  },
                ],
              },
            };
            return jsonRes(data);
          }
          if (query.includes("orders")) {
            const data = {
              data: {
                orders: [
                  {
                    orderBytes: "0x",
                    orderHash: cfg.orderHash,
                    orderbook: { id: "0xorderbook" },
                  },
                ],
              },
            };
            return jsonRes(data);
          }
        }
      } catch (err) {
        // Log error in test mode
        if ((import.meta as any).env?.MODE === "test") {
          console.error("Mock handler error:", err);
        }
        // fallthrough to original
      }
    }

    // Debug log for unhandled URLs
    if ((import.meta as any).env?.MODE === "test") {
      console.log("Mock falling through to original fetch for:", method, url);
    }
    return originalFetch(input, init);
  }) as any;

  if (cfg.hypersyncUrl) {
    axios.post = (async (url: string, payload?: any) => {
      if (url === cfg.hypersyncUrl) {
        // Return empty logs array to simulate no claimed payouts
        // This matches what would happen if there are no Context events on-chain
        return {
          data: {
            data: [
              {
                blocks: [{ number: 100, timestamp: "0x65f5e100" }],
                logs: [], // Empty array - no claimed payouts yet
              },
            ],
            next_block: 101,
          },
        } as any;
      }
      return originalAxiosPost(url as any, payload);
    }) as any;
  }

  return () => {
    globalThis.fetch = originalFetch;
    axios.post = originalAxiosPost;
  };
}

function jsonRes(obj: any) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
