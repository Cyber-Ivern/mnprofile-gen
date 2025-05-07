import { NextApiRequest, NextApiResponse } from 'next';
import { spotifyApi } from '@/utils/spotify';
import { userTokens } from '@/utils/spotify-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  try {
    const data = await spotifyApi.authorizationCodeGrant(code as string);
    const { access_token, refresh_token } = data.body;
    
    // Store both tokens
    userTokens.set(state as string, access_token);
    userTokens.set(`${state}_refresh`, refresh_token);
    
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <html>
        <body>
          <h1>Successfully connected!</h1>
          <p>You can close this window and return to Discord.</p>
          <script>
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Auth callback error:', error);
    res.setHeader('Content-Type', 'text/html');
    res.status(500).send(`
      <html>
        <body>
          <h1>Error during authentication</h1>
          <p>Please try again or contact support if the problem persists.</p>
          <script>
            setTimeout(() => window.close(), 5000);
          </script>
        </body>
      </html>
    `);
  }
} 