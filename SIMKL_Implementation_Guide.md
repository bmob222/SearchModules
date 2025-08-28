# SIMKL API Implementation Guide for Streamer-App

## Overview

The SIMKL API is a comprehensive anime, TV show, and movie tracking service that provides:
- Content search and discovery
- Detailed metadata (titles, descriptions, episodes, ratings)
- User tracking and history management
- Trending and popular content
- Personalized recommendations
- Multiple external ID mappings (AniList, MyAnimeList, IMDB, TMDB, etc.)

## Key Features for Streamer Integration

### 1. Authentication System
- **OAuth 2.0 Flow**: Secure user authentication
- **API Key**: Required for all requests
- **Rate Limiting**: 1000/hour authenticated, 100/hour unauthenticated

### 2. Content Discovery
- **Search**: Multi-type search (anime/shows/movies)
- **Trending**: Real-time trending content
- **Popular**: Most popular content by user engagement
- **Recommendations**: Personalized based on watch history

### 3. Metadata & Details
- **Rich Metadata**: Titles, descriptions, ratings, genres
- **Episode Information**: Complete episode lists with details
- **External IDs**: Links to AniList, MAL, IMDB, TMDB
- **Images**: Posters, fanart, thumbnails

### 4. User Tracking
- **Watch History**: Track what users have watched
- **Progress Tracking**: Episode-level progress
- **Lists Management**: Watching, completed, plan-to-watch

## Implementation Strategy for Streamer-App

### Phase 1: Basic Integration

#### 1.1 Authentication Setup
```javascript
// Environment variables needed
SIMKL_CLIENT_ID=your_client_id
SIMKL_CLIENT_SECRET=your_client_secret  
SIMKL_API_KEY=your_api_key
SIMKL_REDIRECT_URI=your_redirect_uri
```

#### 1.2 Core API Client
```javascript
class SimklAPI {
    constructor(apiKey, accessToken = null) {
        this.baseURL = 'https://api.simkl.com';
        this.apiKey = apiKey;
        this.accessToken = accessToken;
    }
    
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'simkl-api-key': this.apiKey,
            ...options.headers
        };
        
        if (this.accessToken) {
            headers.Authorization = `Bearer ${this.accessToken}`;
        }
        
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            ...options,
            headers
        });
        
        return response.json();
    }
}
```

#### 1.3 Search Implementation
```javascript
async function searchContent(query, type = 'anime') {
    const results = await simkl.request(`/search/${type}`, {
        method: 'GET',
        params: { q: query, limit: 20 }
    });
    
    return results.map(item => ({
        id: item.ids.simkl,
        title: item.title,
        year: item.year,
        poster: item.poster,
        rating: item.rating,
        genres: item.genres,
        overview: item.overview,
        externalIds: item.ids
    }));
}
```

### Phase 2: Advanced Features

#### 2.1 Content Details & Episodes
```javascript
async function getContentDetails(simklId, type = 'anime') {
    const details = await simkl.request(`/${type}/${simklId}`);
    const episodes = await simkl.request(`/${type}/${simklId}/episodes`);
    
    return {
        ...details,
        episodes: episodes.map(ep => ({
            number: ep.episode,
            title: ep.title,
            description: ep.description,
            airDate: ep.aired,
            runtime: ep.runtime,
            simklId: ep.ids.simkl
        }))
    };
}
```

#### 2.2 User Tracking Integration
```javascript
async function markAsWatched(simklId, episodeNumber, type = 'anime') {
    const payload = {
        [type === 'anime' ? 'shows' : type]: [{
            ids: { simkl: simklId },
            seasons: [{
                number: 1,
                episodes: [{
                    number: episodeNumber,
                    watched_at: new Date().toISOString()
                }]
            }]
        }]
    };
    
    return await simkl.request('/sync/history', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}
```

#### 2.3 Recommendations System
```javascript
async function getRecommendations(type = 'anime', limit = 10) {
    return await simkl.request(`/sync/recommendations/${type}`, {
        params: { limit }
    });
}

async function getTrending(type = 'anime', limit = 10) {
    return await simkl.request(`/${type}/trending`, {
        params: { limit }
    });
}
```

### Phase 3: Streamer-App Specific Integration

#### 3.1 Content Matching
```javascript
// Match SIMKL content with your streaming sources
async function matchWithStreamingSources(simklContent) {
    const { externalIds } = simklContent;
    
    // Use AniList ID for anime matching
    if (externalIds.anilist) {
        const streamingSources = await findStreamingSourcesByAnilistId(externalIds.anilist);
        return streamingSources;
    }
    
    // Fallback to title matching
    return await findStreamingSourcesByTitle(simklContent.title);
}
```

#### 3.2 User Progress Sync
```javascript
// Sync user progress between streamer-app and SIMKL
async function syncUserProgress(userId) {
    const userProgress = await getUserProgressFromDB(userId);
    const simklWatching = await simkl.request('/sync/all-items/anime/watching');
    
    // Sync progress both ways
    for (const item of userProgress) {
        const simklItem = findSimklMatch(item, simklWatching);
        if (simklItem) {
            await updateSimklProgress(item);
        }
    }
    
    // Update local progress from SIMKL
    for (const simklItem of simklWatching) {
        await updateLocalProgress(simklItem);
    }
}
```

#### 3.3 Enhanced Discovery
```javascript
// Combine SIMKL data with streaming availability
async function getEnhancedRecommendations() {
    const recommendations = await getRecommendations('anime', 20);
    
    const enhancedRecs = await Promise.all(
        recommendations.map(async (rec) => {
            const streamingSources = await matchWithStreamingSources(rec);
            return {
                ...rec,
                available: streamingSources.length > 0,
                sources: streamingSources
            };
        })
    );
    
    // Prioritize content that's actually streamable
    return enhancedRecs.filter(rec => rec.available);
}
```

## Database Schema Recommendations

### User SIMKL Integration
```sql
CREATE TABLE user_simkl_tokens (
    user_id INT PRIMARY KEY,
    access_token VARCHAR(255),
    refresh_token VARCHAR(255),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Content Mapping
```sql
CREATE TABLE content_simkl_mapping (
    id INT PRIMARY KEY AUTO_INCREMENT,
    internal_content_id INT,
    simkl_id INT,
    anilist_id INT,
    mal_id INT,
    content_type ENUM('anime', 'show', 'movie'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(simkl_id),
    INDEX(anilist_id)
);
```

### Watch Progress
```sql
CREATE TABLE user_watch_progress (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    content_id INT,
    episode_number INT,
    progress_seconds INT,
    completed BOOLEAN DEFAULT FALSE,
    simkl_synced BOOLEAN DEFAULT FALSE,
    watched_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Error Handling & Best Practices

### 1. Rate Limiting
```javascript
class RateLimiter {
    constructor(maxRequests = 1000, windowMs = 3600000) {
        this.requests = [];
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
    
    async checkLimit() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.windowMs);
        
        if (this.requests.length >= this.maxRequests) {
            const waitTime = this.windowMs - (now - this.requests[0]);
            throw new Error(`Rate limit exceeded. Retry after ${waitTime}ms`);
        }
        
        this.requests.push(now);
    }
}
```

### 2. Error Handling
```javascript
async function safeSimklRequest(endpoint, options = {}) {
    try {
        await rateLimiter.checkLimit();
        const response = await simkl.request(endpoint, options);
        
        if (response.error) {
            throw new Error(`SIMKL API Error: ${response.error}`);
        }
        
        return response;
    } catch (error) {
        console.error('SIMKL Request Failed:', error);
        
        // Fallback strategies
        if (error.message.includes('Rate limit')) {
            // Queue for retry
            return await retryWithBackoff(() => simkl.request(endpoint, options));
        }
        
        // Return cached data if available
        return await getCachedData(endpoint);
    }
}
```

### 3. Data Caching
```javascript
class SimklCache {
    constructor(redis) {
        this.redis = redis;
        this.defaultTTL = 3600; // 1 hour
    }
    
    async get(key) {
        const cached = await this.redis.get(`simkl:${key}`);
        return cached ? JSON.parse(cached) : null;
    }
    
    async set(key, data, ttl = this.defaultTTL) {
        await this.redis.setex(`simkl:${key}`, ttl, JSON.stringify(data));
    }
    
    async getOrFetch(key, fetchFunction, ttl = this.defaultTTL) {
        let data = await this.get(key);
        
        if (!data) {
            data = await fetchFunction();
            await this.set(key, data, ttl);
        }
        
        return data;
    }
}
```

## Integration Timeline

### Week 1: Foundation
- [ ] Set up SIMKL developer account
- [ ] Implement basic API client
- [ ] Create authentication flow
- [ ] Basic search functionality

### Week 2: Core Features  
- [ ] Content details and episodes
- [ ] User progress tracking
- [ ] Database schema implementation
- [ ] Content matching logic

### Week 3: Advanced Features
- [ ] Recommendations integration
- [ ] Trending/popular content
- [ ] Progress synchronization
- [ ] Caching layer

### Week 4: Polish & Testing
- [ ] Error handling improvements
- [ ] Rate limiting implementation
- [ ] Performance optimization
- [ ] User testing and feedback

## Benefits for Streamer-App

1. **Rich Metadata**: Enhanced content information and descriptions
2. **User Engagement**: Track viewing progress and history
3. **Discovery**: Trending and personalized recommendations
4. **Community**: Connect with SIMKL's user base
5. **Data Quality**: Accurate, crowd-sourced content information
6. **Multi-Platform**: Sync across different devices and services

## Security Considerations

1. **Token Storage**: Securely store OAuth tokens
2. **API Key Protection**: Never expose API keys in client-side code
3. **User Privacy**: Respect user data and provide privacy controls
4. **Rate Limiting**: Implement proper rate limiting to avoid bans
5. **Error Logging**: Log errors without exposing sensitive data

This comprehensive guide provides everything needed to successfully integrate SIMKL API into your streamer-app, enhancing user experience with rich metadata, tracking capabilities, and content discovery features.