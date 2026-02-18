const N8N_WEBHOOK_URL = process.env.WEB_SCRAPING_TOOL_AGENT_WEBHOOK;

export async function triggerAuditWorkflow(
  domain: string,
  practiceSearchString: string
): Promise<string> {
  if (!N8N_WEBHOOK_URL) {
    const error: any = new Error("n8n webhook URL not configured");
    error.statusCode = 500;
    throw error;
  }

  // Call n8n webhook and WAIT for response
  // n8n creates the DB record and returns the audit_id
  const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      domain,
      practice_search_string: practiceSearchString,
    }),
  });

  if (!n8nResponse.ok) {
    console.error(
      `[Audit] n8n webhook failed with status: ${n8nResponse.status}`
    );
    const error: any = new Error(
      `n8n webhook failed with status ${n8nResponse.status}`
    );
    error.statusCode = 502;
    throw error;
  }

  // Parse response from n8n - expects { audit_id: "uuid" }
  const n8nData = await n8nResponse.json();

  if (!n8nData.audit_id) {
    console.error("[Audit] n8n response missing audit_id:", n8nData);
    const error: any = new Error("n8n response missing audit_id");
    error.statusCode = 502;
    throw error;
  }

  return n8nData.audit_id;
}
