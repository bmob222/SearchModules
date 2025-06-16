const BASE_URL = 'https://animetsu.cc';
const API_URL = 'https://backend.animetsu.cc/api/anime';
const ANILIST_URL = 'https://graphql.anilist.co';
const FORMAT = 'SUB'; // SUB | DUB

// Headers required for API requests
const headers = {
    'Origin': 'https://animetsu.cc',
    'Referer': 'https://animetsu.cc/',
    'Content-Type': 'application/json'
};

async function areRequiredServersUp() {
    const requiredHosts = ['https://animetsu.cc', 'https://backend.animetsu.cc', 'https://graphql.anilist.co'];

    try {
        let promises = [];

        for(let host of requiredHosts) {
            promises.push(
                new Promise(async (resolve) => {
                    let response = await soraFetch(host, { method: 'HEAD' });
                    response.host = host;
                    return resolve(response);
                })
            );
        }

        return Promise.allSettled(promises).then((responses) => {
            for(let response of responses) {
                if(response.status === 'rejected' || response.value?.status != 200) {
                    let message = 'Required source ' + response.value?.host + ' is currently down.';
                    console.log(message);
                    return { success: false, error: encodeURIComponent(message), searchTitle: `Error cannot access ${response.value?.host}, server down. Please try again later.` };
                }
            }

            return { success: true, error: null, searchTitle: null };
        });

    } catch (error) {
        console.log('Server up check error: ' + error.message);
        return { success: false, error: encodeURIComponent('#Failed to access required servers'), searchTitle: 'Error cannot access one or more servers, server down. Please try again later.' };
    }
}

/**
 * Searches Anilist for anime with the given keyword and returns the results
 * @param {string} keyword The keyword to search for
 * @returns {Promise<string>} A promise that resolves with a JSON string containing the search results in the format: `[{"title": "Title", "image": "Image URL", "href": "URL"}, ...]`
 */
async function searchResults(keyword) {
    const serversUp = await areRequiredServersUp();

    if(serversUp.success === false) {
        return JSON.stringify([{
            title: serversUp.searchTitle,
            image: 'https://raw.githubusercontent.com/bmob222/Sora-Modules/main/sora_host_down.png',
            href: '#' + serversUp.error,
        }]);
    }

    try {
        // AniList GraphQL query for anime search
        const query = `
        query ($search: String) {
          Page (perPage: 20) {
            media(type: ANIME, search: $search) {
              id
              title {
                english
                romaji
              }
              coverImage {
                large
              }
            }
          }
        }`;

        const variables = {
            search: keyword
        };

        const response = await soraFetch(ANILIST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                variables: variables
            })
        });

        const data = await response.json();
        const animeList = data.data.Page.media;

        const matchesArray = animeList.map(anime => {
            return {
                title: anime.title.english || anime.title.romaji,
                image: anime.coverImage.large,
                href: anime.id.toString() // We store the AniList ID as the href
            };
        });

        return JSON.stringify(matchesArray);

    } catch (error) {
        console.log('Fetch error: ' + error.message);
        return JSON.stringify([]);
    }
}

/**
 * Extracts the details (description, aliases, airdate) from the given AniList ID
 * @param {string} url The AniList ID required to fetch the details
 * @returns {Promise<string>} A promise that resolves with a JSON string containing the details
 */
async function extractDetails(url) {
    if(url.startsWith('#')) {
        return JSON.stringify([{
            description: decodeURIComponent(url.slice(1)) + ' Please try again later.',
            aliases: '',
            airdate: ''
        }]);
    }

    const anilistId = url; // URL is the AniList ID

    try {
        // AniList GraphQL query for anime details
        const query = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            description
            title {
              english
              romaji
              native
            }
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
            synonyms
            status
          }
        }`;

        const variables = {
            id: parseInt(anilistId)
        };

        const response = await soraFetch(ANILIST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                variables: variables
            })
        });

        const data = await response.json();
        const anime = data.data.Media;

        // Format the airing dates
        let startDate = "";
        if (anime.startDate.year) {
            startDate = `${anime.startDate.year}-${anime.startDate.month || 1}-${anime.startDate.day || 1}`;
        }
        
        let endDate = "Ongoing";
        if (anime.endDate.year) {
            endDate = `${anime.endDate.year}-${anime.endDate.month || 12}-${anime.endDate.day || 31}`;
        }
        
        // Format aliases
        const aliases = [
            anime.title.english, 
            anime.title.romaji, 
            anime.title.native,
            ...(anime.synonyms || [])
        ].filter(Boolean).join(', ');

        const details = {
            description: anime.description.replace(/<[^>]*>/g, ''), // Remove HTML tags
            aliases: aliases,
            airdate: `Aired: ${startDate} to ${endDate}`
        };

        return JSON.stringify([details]);
    } catch(error) {
        console.log('Details error: ' + error.message);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: '',
            airdate: 'Aired: Unknown'
        }]);
    }
}

/**
 * Extracts the episodes from the given AniList ID.
 * @param {string} url - The AniList ID required to fetch the episodes
 * @returns {Promise<string>} A promise that resolves with a JSON string containing the episodes
 */
async function extractEpisodes(url) {
    try {
        if(url.startsWith('#')) throw new Error('Host down but still attempted to get episodes');

        const anilistId = url; // URL is the AniList ID

        const response = await soraFetch(`${API_URL}/episodes/${anilistId}`, {
            headers: headers
        });
        
        const episodesData = await response.json();
        
        // Process the episodes
        let processedEpisodes = [];
        let episodesByNum = {};
        
        // First process all episodes and organize them by episode number
        episodesData.forEach(provider => {
            const providerId = provider.providerId;
            const hasDub = provider.hasDub;
            
            provider.episodes.forEach(ep => {
                const epNum = ep.number;
                const id = ep.id.toString();
                const title = ep.title;
                const img = ep.image;
                
                if (!episodesByNum[epNum]) {
                    episodesByNum[epNum] = [];
                }
                
                episodesByNum[epNum].push({
                    id,
                    providerId,
                    hasDub
                });
                
                // Store metadata about the episode
                if (!processedEpisodes.find(e => e.number === epNum)) {
                    processedEpisodes.push({
                        number: epNum,
                        title: title,
                        img: img
                    });
                }
            });
        });
        
        // Then create the final episode list
        const finalEpisodes = processedEpisodes.map(ep => {
            const providers = episodesByNum[ep.number];
            
            // Format the episodeLink as expected by extractStreamUrl
            const episodeLink = providers.map(p => `${p.id}+${p.providerId}`).join("+");
            
            // Format metadata as "{anilistId}+{epNum}"
            const metadata = `${anilistId}+${ep.number}`;
            
            return {
                href: `${episodeLink}:${metadata}`, // Combine episodeLink and metadata with a separator
                number: ep.number,
                title: ep.title,
                image: ep.img
            };
        });
        
        // Sort episodes by number
        finalEpisodes.sort((a, b) => a.number - b.number);
        
        return JSON.stringify(finalEpisodes);

    } catch (error) {
        console.log('Fetch error: ' + error.message);
        return JSON.stringify([]);
    }
}

/**
 * Extracts the stream URL from the given episode data
 * @param {string} url - The combined episode data string
 * @returns {Promise<string|null>} A promise that resolves with the stream URL if successful
 */
async function extractStreamUrl(url) {
    try {
        // Split the URL to get episodeLink and metadata
        const [episodeLink, metadata] = url.split(':');
        
        if (!metadata) {
            throw new Error("Missing metadata in episode URL");
        }
        
        // Parse metadata
        const [anilistId, epNum] = metadata.split('+');
        
        if (!anilistId || !epNum) {
            throw new Error("Invalid metadata format");
        }
        
        // Parse episode link to get provider IDs
        const linkSplit = episodeLink.split("+");
        const subType = FORMAT === 'SUB' ? 'sub' : 'dub';
        
        // Only process IDs at even indices (odd ones are provider IDs)
        const results = [];
        for (let i = 0; i < linkSplit.length; i += 2) {
            if (i + 1 >= linkSplit.length) break;
            
            const watchId = linkSplit[i];
            const providerId = linkSplit[i + 1];
            
            const apiUrl = `${API_URL}/tiddies?provider=${providerId}&id=${anilistId}&num=${epNum}&subType=${subType}&watchId=${watchId}&dub_id=null`;
            
            try {
                const response = await soraFetch(apiUrl, { headers });
                const data = await response.json();
                
                if (data && data.sources && data.sources.length > 0) {
                    // Find the best quality source
                    let bestSource = data.sources.find(s => s.quality.trim() === 'master');
                    
                    if (!bestSource) {
                        // Sort by quality (assuming quality is in the format "720p" or similar)
                        const sortedSources = data.sources.sort((a, b) => {
                            const qualityA = parseInt(a.quality.replace(/\D/g, '') || '0');
                            const qualityB = parseInt(b.quality.replace(/\D/g, '') || '0');
                            return qualityB - qualityA;
                        });
                        bestSource = sortedSources[0];
                    }
                    
                    if (bestSource) {
                        // Get subtitle if available
                        let subtitle = null;
                        if (data.subtitles && data.subtitles.length > 0) {
                            // Try to find English subtitle first
                            subtitle = data.subtitles.find(s => s.lang === "English")?.url ||
                                       data.subtitles[0]?.url;
                        }
                        
                        results.push({
                            url: bestSource.url,
                            quality: bestSource.quality.trim() === 'master' ? 'multi-quality' : bestSource.quality,
                            subtitle: subtitle,
                            headers: headers
                        });
                    }
                }
            } catch (error) {
                console.log(`Error fetching from provider ${providerId}: ${error.message}`);
            }
        }
        
        // Return the best available source
        if (results.length > 0) {
            // Prioritize sources with subtitles and multi-quality
            const bestSource = results.find(s => s.subtitle && s.quality === 'multi-quality') || 
                              results.find(s => s.quality === 'multi-quality') ||
                              results[0];
            
            // If we have a subtitle, return it with the URL
            if (bestSource.subtitle) {
                return JSON.stringify({
                    url: bestSource.url,
                    subtitles: [{
                        url: bestSource.subtitle,
                        language: "English",
                        format: "vtt"
                    }],
                    headers: bestSource.headers
                });
            }
            
            return bestSource.url;
        }
        
        return null;
    } catch(e) {
        console.log('Error extracting stream: ' + e.message);
        return null;
    }
}

/**
 * Helper function for making fetch requests
 * Tries fetchv2 first, then falls back to regular fetch
 */
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
