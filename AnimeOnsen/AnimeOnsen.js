/**
 * AnimeOnsen module for Sora
 * @author bmob222
 * @version 1.0.0
 * @date 2025-06-16
 */

// Constants
const TOKEN_URL = 'https://auth.animeonsen.xyz/oauth/token';
const API_URL = 'https://api.animeonsen.xyz/v4';
const CDN_URL = 'https://cdn.animeonsen.xyz/video/mp4-dash';

// Client credentials
const AUTH = {
    client_id: 'f296be26-28b5-4358-b5a1-6259575e23b7',
    client_secret: '349038c4157d0480784753841217270c3c5b35f4281eaee029de21cb04084235',
    grant_type: 'client_credentials'
};

// Token storage
let tokenData = null;

/**
 * Get authentication token
 * @returns {Promise<string>} Access token
 */
async function getToken() {
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Return existing token if valid
    if (tokenData && tokenData.expires > currentTime) {
        return tokenData.token;
    }
    
    try {
        const formData = new URLSearchParams();
        formData.append('client_id', AUTH.client_id);
        formData.append('client_secret', AUTH.client_secret);
        formData.append('grant_type', AUTH.grant_type);
        
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Failed to get auth token');
        }
        
        const data = await response.json();
        
        tokenData = {
            token: data.access_token,
            expires: currentTime + data.expires_in - 300 // 5 minutes buffer
        };
        
        return tokenData.token;
    } catch (error) {
        console.error('Authentication error:', error);
        throw error;
    }
}

/**
 * Search function (required by Sora)
 * @param {string} query - Search query
 * @returns {Promise<object>} Search results
 */
async function searchJS(query) {
    try {
        const token = await getToken();
        const sanitizedQuery = encodeURIComponent(query.trim());
        const url = `${API_URL}/search/${sanitizedQuery}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Search request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.result || data.result.length === 0) {
            return [];
        }
        
        return data.result.map(item => ({
            id: item.content_id,
            title: item.content_title_en || item.content_title,
            poster: `${API_URL}/image/210x300/${item.content_id}`,
            type: "anime"
        }));
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

/**
 * Get media info function (required by Sora)
 * @param {string} mediaId - Media ID
 * @returns {Promise<object>} Media details with episodes
 */
async function mediaJS(mediaId) {
    try {
        const token = await getToken();
        
        // Get episodes list
        const episodesUrl = `${API_URL}/content/${mediaId}/episodes`;
        const episodesResponse = await fetch(episodesUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!episodesResponse.ok) {
            throw new Error(`Failed to fetch episodes: ${episodesResponse.status}`);
        }
        
        const episodesData = await episodesResponse.json();
        
        // Get anime details
        const detailsUrl = `${API_URL}/content/${mediaId}`;
        const detailsResponse = await fetch(detailsUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!detailsResponse.ok) {
            throw new Error(`Failed to fetch anime details: ${detailsResponse.status}`);
        }
        
        const details = await detailsResponse.json();
        
        // Format episodes
        const episodes = Object.keys(episodesData).map(epNum => ({
            id: `${mediaId}|${epNum}`,
            number: parseInt(epNum, 10) || 0,
            title: episodesData[epNum].contentTitle_episode_en || `Episode ${epNum}`,
            thumbnail: `${API_URL}/image/episode/1920x1080/${mediaId}/${epNum}`
        })).sort((a, b) => a.number - b.number);
        
        return {
            id: mediaId,
            title: details.content_title_en || details.content_title,
            poster: `${API_URL}/image/210x300/${mediaId}`,
            banner: `${API_URL}/image/banner/1900x400/${mediaId}`,
            description: details.content_description_en || details.content_description || '',
            episodes: episodes,
            type: "anime"
        };
    } catch (error) {
        console.error('Media error:', error);
        return null;
    }
}

/**
 * Get stream function (required by Sora)
 * @param {string} episodeId - Episode ID (format: mediaId|episodeNumber)
 * @returns {Promise<object>} Stream data
 */
async function streamJS(episodeId) {
    try {
        const token = await getToken();
        
        // Parse episode ID
        const [mediaId, episodeNumber] = episodeId.split('|');
        if (!mediaId || !episodeNumber) {
            throw new Error('Invalid episode ID format');
        }
        
        // Stream URL
        const manifest = `${CDN_URL}/${mediaId}/${episodeNumber}/manifest.mpd`;
        
        // Subtitle URL
        const subtitleUrl = `${API_URL}/subtitles/${mediaId}/en-US/${episodeNumber}`;
        const subtitleResponse = await fetch(subtitleUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        // Construct stream data
        const streamData = {
            sources: [
                {
                    url: manifest,
                    type: "dash",
                    quality: "auto"
                }
            ],
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
        
        // Add subtitles if available
        if (subtitleResponse.ok) {
            streamData.subtitles = [
                {
                    url: subtitleUrl,
                    language: "English",
                    format: "ass"
                }
            ];
        }
        
        return streamData;
    } catch (error) {
        console.error('Stream error:', error);
        return null;
    }
}
