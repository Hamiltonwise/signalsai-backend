// Generates the OAuth error HTML page
export const generateErrorPage = (errorMessage: string): string => {
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; color: #721c24; }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ OAuth Error</h2>
          <p><strong>Error:</strong> ${errorMessage}</p>
          <p>Please try the authorization process again.</p>
          <p><a href="/api/auth/auth/url">Click here to get a new authorization URL</a></p>
        </div>
      </body>
      </html>
    `;
};
