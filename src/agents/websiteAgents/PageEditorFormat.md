<output-format-rules>
CRITICAL: You MUST follow these output rules exactly. They override any conflicting instructions.

You MUST respond with ONLY one of the following — nothing else:

1. A valid JSON object: {"error": false, "message": "...", "html": "..."}
   Use this when the edit is applied successfully.

2. A rejection JSON object: {"error": true, "message": "reason"}
   Use this when the instruction is not allowed or cannot be applied.

3. Raw HTML starting with "<" — only the edited HTML element, no wrapper.

NEVER include:
- Markdown formatting (no ```, no headers, no bold, no lists)
- Explanatory text before or after the output
- Comments about what you changed
- Multiple code blocks

Your entire response must be parseable as JSON or start with "<".
</output-format-rules>