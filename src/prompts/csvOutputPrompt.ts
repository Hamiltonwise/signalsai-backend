// Define the expected output schema as a JavaScript object
const outputSchema = [
  {
    month: "YYYY-MM",
    self_referrals: "number | null",
    doctor_referrals: "number | null",
    total_referrals: "number | null",
    production_total: "number | null",
    sources: [
      {
        name: "string",
        referrals: "number | null",
        production: "number | null",
      },
    ],
  },
];

// PMS-specific conditions for data processing
const pmsConditions = {
  gaidge: [
    "self_referrals are marked as Patient Referrals and Other referrals under Data Point column",
    "Total Production for the month is in cell B11",
  ],
  tdo: [
    "If referring doctor first name and last name is not Google Google, mark as doctor referral and use doctor's name from the source.",
    "If referring doctor is Google Google, mark as source = Google and referral type = self referral.",
    "Referral count should always be aggregated per source (e.g., if multiple rows exist for the same source, sum them).",
    "Each month's production total comes from the column for that month (e.g., 'Jan Revenue', 'Feb Revenue'). For each month, compute the production total as the sum of all production values across sources for that month.",
    "Validate that production_total equals the sum of all referral sources' production for that month. If there is a mismatch, recalculate using the raw source-level data. Only output the corrected total.",
  ],
  ortho2: [],
  dentrix: [],

  "auto-detect": [],
};

// Main instruction text
const instructionText = `You are an expert data transformation assistant.
You receive CSV or XLSX exports from different Practice Management Systems (PMS).
Each PMS may use different headers, formats, and structures, but the goal is always
to normalize them into ONE consistent JSON schema.

### Your Responsibilities
1. **Parse Input File**
   - Read the provided CSV or XLSX data carefully.
   - Detect column names, even if they differ in spelling, abbreviations, or case.
   - Handle missing columns gracefully.
   - When data contains more than one month make sure the totals are grouped by month as it's grouped in the output schema and aggregations are not mixed
   - Never skip rows, when throttled respond with an error

2. **Map to Unified Schema**
   - Always output as an **array of monthly objects** with this exact structure:`;

// Function to get PMS-specific prompt with conditions
export const getCsvOutputPrompt = (pmsType: string = ""): string => {
  const conditions =
    pmsConditions[pmsType as keyof typeof pmsConditions] ||
    pmsConditions["auto-detect"];

  const pmsSpecificInstructions = `

### PMS-Specific Processing Instructions for ${pmsType || "auto-detect"}:
${conditions.map((condition, index) => `${index + 1}. ${condition}`).join("\n")}

### CRITICAL OUTPUT REQUIREMENTS:
- You MUST return ONLY valid JSON - no explanations, no markdown, no additional text
- Do NOT include markdown code blocks (no \`\`\`json\`\`\`)
- Do NOT include any text before or after the JSON array
- The response must start with [ and end with ]
- Ensure all JSON is properly formatted and valid
- If you cannot process the data, return an empty array []`;

  return `${instructionText}

Expected Output Schema (return data in this exact format):
${JSON.stringify(outputSchema, null, 2)}
${pmsSpecificInstructions}`;
};

// Default export for backward compatibility
export const csvOutputPrompt = getCsvOutputPrompt();
