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

// Get token for API requests
async function getToken() {
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Return existing token if it's still valid
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

// Search for anime
async function search(query) {
    try {
        const token = await getToken();
        const sanitizedQuery = encodeURIComponent(query.replace(/-/g, ''));
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
            return { results: [] };
        }
        
        const results = data.result.map(item => {
            return {
                id: item.content_id,
                title: item.content_title_en || item.content_title,
                image: `${API_URL}/image/210x300/${item.content_id}`,
                extra: {
                    type: "anime"
                }
            };
        });
        
        return { results };
    } catch (error) {
        console.error('Search error:', error);
        return { error: error.message };
    }
}

// Get anime details with episodes
async function getMedia(mediaId) {
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
        const episodes = Object.keys(episodesData).map(epNum => {
            const epData = episodesData[epNum];
            return {
                id: `${epNum}+${mediaId}`,
                number: parseInt(epNum) || 0,
                title: epData.contentTitle_episode_en || `Episode ${epNum}`,
                image: `${API_URL}/image/episode/1920x1080/${mediaId}/${epNum}`
            };
        });
        
        // Sort episodes by number
        episodes.sort((a, b) => a.number - b.number);
        
        return {
            id: mediaId,
            title: details.content_title_en || details.content_title,
            description: details.content_description_en || details.content_description || '',
            image: `${API_URL}/image/210x300/${mediaId}`,
            banner: `${API_URL}/image/banner/1900x400/${mediaId}`,
            episodes: episodes
        };
    } catch (error) {
        console.error('GetMedia error:', error);
        return { error: error.message };
    }
}

// Get video stream
async function getStream(episodeId) {
    try {
        const token = await getToken();
        
        // Parse the episodeId format (epNum+animeId)
        const parts = episodeId.split('+');
        if (parts.length !== 2) {
            throw new Error('Invalid episode ID format');
        }
        
        const epNum = parts[0];
        const animeId = parts[1];
        
        // Stream URL
        const streamUrl = `${CDN_URL}/${animeId}/${epNum}/manifest.mpd`;
        
        // Subtitle URL
        const subtitleUrl = `${API_URL}/subtitles/${animeId}/en-US/${epNum}`;
        
        // Check if subtitles are available
        const subtitleResponse = await fetch(subtitleUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const subtitles = [];
        if (subtitleResponse.ok) {
            subtitles.push({
                id: 'en',
                language: 'English',
                url: subtitleUrl,
                format: 'ass'
            });
        }
        
        return {
            sources: [
                {
                    url: streamUrl,
                    quality: 'auto',
                    format: 'dash'
                }
            ],
            subtitles: subtitles,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    } catch (error) {
        console.error('GetStream error:', error);
        return { error: error.message };
    }
}

// Module exports
module.exports = {
    search,
    getMedia,
    getStream
};
