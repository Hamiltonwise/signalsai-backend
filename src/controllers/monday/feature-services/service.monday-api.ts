import axios from "axios";

/**
 * Single point of communication with the Monday.com GraphQL API.
 * All Monday.com API calls must go through this function.
 */

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN!;
const MONDAY_API_URL = "https://api.monday.com/v2";

/**
 * Execute GraphQL query/mutation against Monday.com API
 */
export async function executeMondayGraphQL(
  query: string,
  variables?: any
): Promise<any> {
  if (!MONDAY_API_TOKEN) {
    throw new Error("MONDAY_API_TOKEN is not configured");
  }

  const response = await axios.post(
    MONDAY_API_URL,
    {
      query,
      variables,
    },
    {
      headers: {
        Authorization: `Bearer ${MONDAY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (response.data.errors) {
    throw new Error(
      `Monday.com API Error: ${JSON.stringify(response.data.errors)}`
    );
  }

  return response.data.data;
}
