// AnimeOnsen module based on frostnova721/animestream implementation
const API_URL = 'https://api.animeonsen.xyz/v4';
const AUTH_URL = 'https://auth.animeonsen.xyz/oauth/token';
const CDN_URL = 'https://cdn.animeonsen.xyz/video/mp4-dash';

// OAuth client credentials
const CLIENT_ID = 'f296be26-28b5-4358-b5a1-6259575e23b7';
const CLIENT_SECRET = '349038c4157d0480784753841217270c3c5b35f4281eaee029de21cb04084235';

// Token storage
let tokenData = {
  token: null,
  expiration: 0
};

// Check if token is valid or needs refresh
async function checkAndUpdateToken() {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Get a new token if expired or not available
  if (!tokenData.token || tokenData.expiration < (currentTime + 3600)) {
    console.log('[AnimeOnsen] Generating new token');
    
    try {
      const newToken = await getToken();
      tokenData = {
        token: newToken.access_token,
        expiration: currentTime + newToken.expires_in
      };
      console.log('[AnimeOnsen] New token generated successfully');
    } catch (error) {
      console.error('[AnimeOnsen] Token generation failed:', error);
      throw new Error('Failed to authenticate with AnimeOnsen');
    }
  }
  
  return tokenData.token;
}

// Get authentication token
async function getToken() {
  try {
    const response = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'grant_type': 'client_credentials'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Authentication failed with status ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Token fetch error:', error);
    throw new Error('Authentication failed');
  }
}

// Search for anime
async function search(query) {
  try {
    const token = await checkAndUpdateToken();
    const sanitizedQuery = query.replace(/-/g, '');
    
    const response = await fetch(`${API_URL}/search/${encodeURIComponent(sanitizedQuery)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Search failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.result || data.result.length === 0) {
      return { results: [] };
    }
    
    const results = data.result.map(item => ({
      id: item.content_id,
      title: item.content_title_en || item.content_title,
      poster: `${API_URL}/image/210x300/${item.content_id}`,
      type: 'anime'
    }));
    
    return { results };
  } catch (error) {
    return {
      error: `Search failed: ${error.message}`
    };
  }
}

// Get anime information with episodes
async function getInfo(id) {
  try {
    const token = await checkAndUpdateToken();
    
    // Get episodes
    const episodesResponse = await fetch(`${API_URL}/content/${id}/episodes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!episodesResponse.ok) {
      throw new Error(`Failed to fetch episodes with status ${episodesResponse.status}`);
    }
    
    const episodesData = await episodesResponse.json();
    
    // Get metadata for the anime
    const metadataResponse = await fetch(`${API_URL}/content/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!metadataResponse.ok) {
      throw new Error(`Failed to fetch anime metadata with status ${metadataResponse.status}`);
    }
    
    const metadata = await metadataResponse.json();
    
    // Process episodes
    const episodes = Object.keys(episodesData).map(epNum => {
      const episode = episodesData[epNum];
      return {
        number: parseInt(epNum) || Object.keys(episodesData).indexOf(epNum) + 1,
        title: episode.contentTitle_episode_en || `Episode ${epNum}`,
        image: `${API_URL}/image/episode/1920x1080/${id}/${epNum}`,
        id: `${epNum}+${id}`
      };
    }).sort((a, b) => a.number - b.number);
    
    return {
      id,
      title: metadata.content_title_en || metadata.content_title,
      poster: `${API_URL}/image/210x300/${id}`,
      banner: `${API_URL}/image/banner/1900x400/${id}`,
      description: metadata.content_description_en || metadata.content_description || '',
      episodes
    };
  } catch (error) {
    return {
      error: `Failed to get anime info: ${error.message}`
    };
  }
}

// Get stream data for a specific episode
async function getStreams(id, episodeNumber) {
  try {
    const token = await checkAndUpdateToken();
    
    // Parse the combined ID format (epNum+animeId)
    const idParts = id.split('+');
    const epNum = idParts[0];
    const animeId = idParts[1] || episodeNumber;
    
    // Construct the stream URL and subtitle URL
    const streamUrl = `${CDN_URL}/${animeId}/${epNum}/manifest.mpd`;
    const subtitleUrl = `${API_URL}/subtitles/${animeId}/en-US/${epNum}`;
    
    // Verify if the stream exists
    const streamResponse = await fetch(streamUrl, {
      method: 'HEAD'
    });
    
    if (!streamResponse.ok) {
      throw new Error('Stream not found or inaccessible');
    }
    
    // Check if subtitles are available
    let subtitles = [];
    try {
      const subtitleResponse = await fetch(subtitleUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (subtitleResponse.ok) {
        subtitles.push({
          language: 'English',
          url: subtitleUrl,
          format: 'ass'
        });
      }
    } catch (error) {
      console.log('Subtitle fetch error (non-critical):', error);
    }
    
    return {
      sources: [{
        url: streamUrl,
        quality: 'auto',
        format: 'dash'
      }],
      subtitles,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
  } catch (error) {
    return {
      error: `Failed to get streams: ${error.message}`
    };
  }
}

// Export module functions
module.exports = {
  search,
  getInfo,
  getStreams
};
