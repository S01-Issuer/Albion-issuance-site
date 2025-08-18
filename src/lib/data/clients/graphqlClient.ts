export async function executeGraphQL<T>(
  url: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  return json.data as T;
}

