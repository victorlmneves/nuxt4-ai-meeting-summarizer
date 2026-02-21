/**
 * OAuth utilities for token exchange and user profile fetching
 */

export interface IGitHubUser {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string;
}

export interface IGoogleUser {
    sub: string;
    email: string;
    name: string;
    picture: string;
}

export interface IOAuthConfig {
    id: string;
    secret: string;
}

interface IGitHubTokenResponse {
    access_token: string;
    error?: string;
    error_description?: string;
}

interface IGoogleTokenResponse {
    id_token: string;
    error?: string;
    error_description?: string;
}

/**
 * Exchange GitHub authorization code for access token
 * @param {string} code - The GitHub authorization code
 * @param {any} config - The GitHub OAuth configuration object
 * @returns {Promise<string>} The access token as a string
 */
export async function exchangeGitHubCode(code: string, config: IOAuthConfig): Promise<string> {
    if (!config.id || !config.secret) {
        throw new Error('GitHub OAuth config missing (id or secret)');
    }

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
            client_id: config.id,
            client_secret: config.secret,
            code,
        }),
    });

    const data = (await tokenResponse.json()) as IGitHubTokenResponse;

    if (data.error) {
        throw new Error(`GitHub OAuth error: ${data.error_description}`);
    }

    return data.access_token;
}

/**
 * Fetch authenticated GitHub user profile
 * @param {string} accessToken - The GitHub access token
 * @returns {Promise<IGitHubUser>} The authenticated GitHub user profile
 */
export async function getGitHubUser(accessToken: string): Promise<IGitHubUser> {
    const response = await fetch('https://api.github.com/user', {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch GitHub user: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Exchange Google authorization code for tokens
 * @param {string} code - The Google authorization code
 * @param {any} config - The Google OAuth configuration object
 * @returns {Promise<string>} The ID token (JWT)
 */
export async function exchangeGoogleCode(code: string, config: IOAuthConfig): Promise<string> {
    if (!config.id || !config.secret) {
        throw new Error('Google OAuth config missing (id or secret)');
    }

    const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: config.id,
            client_secret: config.secret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${siteUrl}/api/auth/google`,
        }),
    });

    const data = (await tokenResponse.json()) as IGoogleTokenResponse;

    if (data.error) {
        throw new Error(`Google OAuth error: ${data.error_description}`);
    }

    return data.id_token; // JWT
}

/**
 * Decode Google ID token (JWT)
 * In production, verify the JWT signature server-side
 * @param {string} idToken - The Google ID token (JWT)
 * @returns {Promise<IGoogleUser>} The decoded Google user information
 */
export async function decodeGoogleToken(idToken: string): Promise<IGoogleUser> {
    try {
        // Split JWT and decode payload (unsafe but works for basic validation)
        const parts = idToken.split('.');

        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }

        const decoded = JSON.parse(
            Buffer.from(parts[1]!, 'base64').toString('utf-8')
        ) as IGoogleUser;

        return decoded;
    } catch (error) {
        throw new Error(`Failed to decode Google token: ${error}`);
    }
}
