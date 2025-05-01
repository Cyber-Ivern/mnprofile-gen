declare module 'spotify-web-api-node' {
  interface SpotifyWebApi {
    setAccessToken(token: string): void;
    getMyTopTracks(options: { limit: number }): Promise<{
      body: {
        items: Array<{
          name: string;
          artists: Array<{
            name: string;
          }>;
        }>;
      };
    }>;
    createAuthorizeURL(scopes: string[], state: string): string;
  }

  interface SpotifyWebApiOptions {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }

  class SpotifyWebApi {
    constructor(options: SpotifyWebApiOptions);
  }

  export default SpotifyWebApi;
} 