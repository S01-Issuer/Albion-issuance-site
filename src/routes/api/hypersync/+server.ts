import { json, type RequestEvent } from "@sveltejs/kit";
import axios from "axios";
import { PRIVATE_HYPERSYNC_API_KEY } from "$env/static/private";
import type { HypersyncResponseData } from "$lib/utils/claims";

export async function POST({ request }: RequestEvent) {
  try {
    const body = await request.json();

    const {
      client,
      from_block,
      logs,
      field_selection
    } = body;

    const res = await axios.post<HypersyncResponseData>(
      client,
      {
        from_block,
        logs,
        field_selection
      },
      {
        headers: {
          Authorization: `Bearer ${PRIVATE_HYPERSYNC_API_KEY}`
        }
      }
    );

    return json(res.data);
  } catch (err) {
    console.error("Hypersync error", err);
    return json(
      { error: "Hypersync request failed" },
      { status: 500 }
    );
  }
}
