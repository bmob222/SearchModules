/**
 * SIMKL module for Sora
 * @author bmob222  
 * @version 1.0.0
 * @date 2024-01-16
 */

// Constants
const BASE_URL = 'https://api.simkl.com';
const OAUTH_URL = 'https://api.simkl.com/oauth/token';

// Configuration - These should be set via environment variables
const CONFIG = {
    client_id: process.env.SIMKL_CLIENT_ID || 'your_client_id',
    client_secret: process.env.SIMKL_CLIENT_SECRET || 'your_client_secret',
    api_key: process.env.SIMKL_API_KEY || 'your_api_key',
    redirect_uri: process.env.SIMKL_REDIRECT_URI || 'your_redirect_uri'
};

// Token storage
let tokenData = null;

/**
 * Get authentication token using OAuth client credentials
 * @returns {Promise<string>} Access token
 */
async function getToken() {
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Return existing token if valid
    if (tokenData && tokenData.expires > currentTime) {
        return tokenData.token;
    }
    
    try {
        const response = await fetch(OAUTH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: CONFIG.client_id,
                client_secret: CONFIG.client_secret,
                grant_type: 'client_credentials'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        tokenData = {
            token: data.access_token,
            expires: currentTime + (data.expires_in || 3600) - 300 // 5 minutes buffer
        };
        
        return tokenData.token;
    } catch (error) {
        console.error('SIMKL Authentication error:', error);
        throw error;
    }
}

/**
 * Make authenticated request to SIMKL API
 * @param {string} endpoint - API endpoint
 * @param {object} options - Request options
 * @returns {Promise<object>} API response
 */
async function simklRequest(endpoint, options = {}) {
    try {
        const token = await getToken();
        
        const headers = {
            'Content-Type': 'application/json',
            'simkl-api-key': CONFIG.api_key,
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };
        
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            throw new Error(`SIMKL API error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('SIMKL Request error:', error);
        throw error;
    }
}

/**
 * Search function (required by Sora)
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
async function searchJS(query) {
    try {
        const sanitizedQuery = encodeURIComponent(query.trim());
        const results = await simklRequest(`/search/anime?q=${sanitizedQuery}&limit=20`);
        
        if (!results || results.length === 0) {
            return [];
        }
        
        return results.map(item => ({
            id: item.ids.simkl.toString(),
            title: item.title,
            poster: item.poster || `https://simkl.in/posters/${item.ids.simkl}_m.jpg`,
            year: item.year,
            type: "anime",
            rating: item.rating,
            genres: item.genres || [],
            overview: item.overview || '',
            externalIds: item.ids
        }));
    } catch (error) {
        console.error('SIMKL Search error:', error);
        return [];
    }
}

/**
 * Get media info function (required by Sora)
 * @param {string} mediaId - SIMKL media ID
 * @returns {Promise<object>} Media details with episodes
 */
async function mediaJS(mediaId) {
    try {
        // Get content details
        const details = await simklRequest(`/anime/${mediaId}`);
        
        // Get episodes
        const episodes = await simklRequest(`/anime/${mediaId}/episodes`);
        
        if (!details) {
            return null;
        }
        
        return {
            id: mediaId,
            title: details.title,
            poster: details.poster || `https://simkl.in/posters/${mediaId}_m.jpg`,
            fanart: details.fanart || `https://simkl.in/fanart/${mediaId}_medium.jpg`,
            year: details.year,
            rating: details.rating,
            genres: details.genres || [],
            description: details.overview || '',
            status: details.status,
            totalEpisodes: details.total_episodes || episodes.length,
            episodes: episodes.map(ep => ({
                id: `${mediaId}|${ep.episode}`,
                number: ep.episode,
                title: ep.title || `Episode ${ep.episode}`,
                description: ep.description || '',
                aired: ep.aired,
                runtime: ep.runtime || details.runtime || 24
            })),
            type: "anime",
            externalIds: details.ids
        };
    } catch (error) {
        console.error('SIMKL Media error:', error);
        return null;
    }
}

/**
 * Get stream function (required by Sora)
 * Note: SIMKL doesn't provide streaming links directly
 * This function would need to integrate with actual streaming providers
 * @param {string} episodeId - Episode ID (format: mediaId|episodeNumber)
 * @returns {Promise<object>} Stream data
 */
async function streamJS(episodeId) {
    try {
        const [mediaId, episodeNumber] = episodeId.split('|');
        if (!mediaId || !episodeNumber) {
            throw new Error('Invalid episode ID format');
        }
        
        // Get episode details from SIMKL
        const details = await simklRequest(`/anime/${mediaId}`);
        const episodes = await simklRequest(`/anime/${mediaId}/episodes`);
        const episode = episodes.find(ep => ep.episode == episodeNumber);
        
        if (!details || !episode) {
            return null;
        }
        
        // Since SIMKL doesn't provide streaming links, we need to integrate with streaming providers
        // This would typically involve using the external IDs to find streams from other sources
        
        // Example integration with other providers using external IDs
        const externalIds = details.ids;
        let streamSources = [];
        
        // Try to find streams using AniList ID (common integration point)
        if (externalIds.anilist) {
            // This would call your existing anime providers (like Gojo or AnimeOnsen)
            // streamSources = await findStreamsByAnilistId(externalIds.anilist, episodeNumber);
        }
        
        // Try to find streams using MyAnimeList ID
        if (externalIds.mal && streamSources.length === 0) {
            // streamSources = await findStreamsByMALId(externalIds.mal, episodeNumber);
        }
        
        // Fallback: search by title
        if (streamSources.length === 0) {
            // streamSources = await findStreamsByTitle(details.title, episodeNumber);
        }
        
        // For demonstration, return a placeholder structure
        return {
            sources: streamSources.length > 0 ? streamSources : [
                {
                    url: `https://example.com/stream/${mediaId}/${episodeNumber}`,
                    type: "mp4",
                    quality: "1080p",
                    note: "Placeholder - integrate with actual streaming providers"
                }
            ],
            subtitles: [
                {
                    url: `https://example.com/subtitles/${mediaId}/${episodeNumber}/en.vtt`,
                    language: "English",
                    format: "vtt"
                }
            ],
            headers: {
                'User-Agent': 'SIMKL-Streamer-App/1.0'
            },
            metadata: {
                title: episode.title || `Episode ${episodeNumber}`,
                description: episode.description || '',
                duration: episode.runtime || details.runtime || 24,
                thumbnail: details.poster,
                simklId: mediaId,
                episodeNumber: episodeNumber,
                externalIds: externalIds
            }
        };
    } catch (error) {
        console.error('SIMKL Stream error:', error);
        return null;
    }
}

/**
 * Get trending anime (additional function)
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} Trending anime
 */
async function getTrending(limit = 10) {
    try {
        const results = await simklRequest(`/anime/trending?limit=${limit}`);
        
        return results.map(item => ({
            id: item.ids.simkl.toString(),
            title: item.title,
            poster: item.poster || `https://simkl.in/posters/${item.ids.simkl}_m.jpg`,
            year: item.year,
            rank: item.rank,
            watchers: item.watchers,
            type: "anime"
        }));
    } catch (error) {
        console.error('SIMKL Trending error:', error);
        return [];
    }
}

/**
 * Get popular anime (additional function)
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} Popular anime
 */
async function getPopular(limit = 10) {
    try {
        const results = await simklRequest(`/anime/popular?limit=${limit}`);
        
        return results.map(item => ({
            id: item.ids.simkl.toString(),
            title: item.title,
            poster: item.poster || `https://simkl.in/posters/${item.ids.simkl}_m.jpg`,
            year: item.year,
            rank: item.rank,
            watchers: item.watchers,
            type: "anime"
        }));
    } catch (error) {
        console.error('SIMKL Popular error:', error);
        return [];
    }
}

/**
 * Mark episode as watched (requires user authentication)
 * @param {string} mediaId - SIMKL media ID
 * @param {number} episodeNumber - Episode number
 * @returns {Promise<object>} Response from SIMKL
 */
async function markAsWatched(mediaId, episodeNumber) {
    try {
        const payload = {
            shows: [{
                ids: { simkl: parseInt(mediaId) },
                seasons: [{
                    number: 1,
                    episodes: [{
                        number: episodeNumber,
                        watched_at: new Date().toISOString()
                    }]
                }]
            }]
        };
        
        return await simklRequest('/sync/history', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error('SIMKL Mark as watched error:', error);
        return null;
    }
}

/**
 * Get user's watching list (requires user authentication)
 * @returns {Promise<Array>} Currently watching anime
 */
async function getUserWatching() {
    try {
        const results = await simklRequest('/sync/all-items/anime/watching');
        
        return results.map(item => ({
            id: item.show.ids.simkl.toString(),
            title: item.show.title,
            lastWatched: item.last_watched_at,
            progress: item.seasons[0]?.episodes || []
        }));
    } catch (error) {
        console.error('SIMKL User watching error:', error);
        return [];
    }
}

// Export functions for Sora compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        searchJS,
        mediaJS,
        streamJS,
        getTrending,
        getPopular,
        markAsWatched,
        getUserWatching
    };
}