import httpx
from typing import List, Dict, Any, Optional
import logging
import re
from datetime import datetime, timezone
import math

from app.core.config import settings

logger = logging.getLogger(__name__)

YOUTUBE_API_KEY = settings.YOUTUBE_API_KEY
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"


def _build_search_query(topic: str, level: Optional[str], style: Optional[str], subject: Optional[str] = None) -> str:
    """
    Build a tight, topic-focused search query.
    If the topic is very long and descriptive, we use it directly to avoid over-constraining.
    Otherwise, we combine with subject and level for context.
    """
    if len(topic) > 60:
        # Long topics are usually very specific (e.g., from a roadmap)
        return topic

    query_parts = []
    # Prepend subject for academic context
    if subject:
        query_parts.append(subject)
    
    # Add the topic
    query_parts.append(topic)

    # Add ONE level qualifier
    if level:
        lv = level.lower()
        if "primary" in lv:
            query_parts.append("for kids explained")
        elif "jss" in lv or "junior" in lv:
            query_parts.append("lesson explained")
        elif "ss" in lv or "senior" in lv or "secondary" in lv:
            query_parts.append("lesson explained")
        elif "professional" in lv:
            query_parts.append("in-depth tutorial")
    else:
        query_parts.append("explained")

    return " ".join(query_parts)


def _title_is_relevant(title: str, topic: str) -> bool:
    """
    Check if a video title is actually relevant to the requested topic.
    Extracts core keywords from the topic and checks if at least some
    appear in the video title.
    """
    # Normalize
    title_lower = title.lower()
    topic_lower = topic.lower()

    # Extract meaningful words (3+ chars, skip common stopwords)
    stopwords = {"the", "and", "for", "with", "from", "into", "about", "using", "how", "what", "why", "this", "that", "techniques", "analysis", "project", "development", "real", "world"}
    topic_words = [w for w in re.split(r'\W+', topic_lower) if len(w) >= 3 and w not in stopwords]

    if not topic_words:
        return True

    # Count how many topic keywords appear in the title
    matches = sum(1 for w in topic_words if w in title_lower)
    
    # More permissive threshold:
    # If 2+ specific keywords match, it's likely relevant enough for broad topics
    if len(topic_words) > 6:
        return matches >= 2 
    return matches >= 1


def _is_mixed_language(text: str) -> bool:
    """
    Check if the text likely contains Nigerian Pidgin, Hinglish, Tamil-English or other mixed local languages.
    Uses a combination of strong single markers and weaker combined markers.
    """
    if not text:
        return False
        
    text_lower = text.lower()
    
    # Strong markers: If even ONE appears, it's almost certainly non-English or mixed
    strong_markers = {
        "wetin", "podunga", "pannunga", "wey", "kya", "sab", "kaise", 
        "kahan", "mein"
    }

    # Weak markers: Common in mixed languages but can appear in pure english (like 'bro', 'sir')
    # These require at least 2 matches to trigger
    weak_markers = {
        "na", "dey", "una", "abi", "kini", "ba", "don", "pikin", "sabi", 
        "intha", "eligible", "bro", "sir", "yaar", "hai", "bhai", "ji", 
        "aap", "hum", "sab", "toh", "kab", "ah", "ku", "pls"
    }
    
    # Split text into words
    words = set(re.split(r'\W+', text_lower))
    
    # Check for strong markers
    if words.intersection(strong_markers):
        return True
    
    # Check for weak markers threshold
    matches = words.intersection(weak_markers)
    return len(matches) >= 2


def _parse_duration(duration_str: str) -> int:
    """
    Parse ISO 8601 duration string (e.g., PT1H30M10S) to seconds.
    """
    import re
    pattern = re.compile(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?')
    match = pattern.match(duration_str)
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def _calculate_duration_score(duration_sec: int, level: Optional[str]) -> float:
    """
    Calculate score based on target lengths:
    - Primary: 15m (900s)
    - JSS: 30m (1800s)
    - SS: 60m (3600s)
    - Professional: 90m (5400s)
    Strict minimum: 6m (360s)
    """
    if duration_sec < 360: # Strictly no videos less than 6 minutes
        return 0.0
        
    targets = {
        "primary": 900,
        "jss": 1800,
        "ss": 3600,
        "professional": 5400
    }
    
    # Extract general level category
    level_cat = "professional" # Default
    if level:
        level_lower = level.lower()
        if "primary" in level_lower: level_cat = "primary"
        elif "jss" in level_lower: level_cat = "jss"
        elif "ss" in level_lower: level_cat = "ss"
    
    target = targets.get(level_cat, 3600)
    
    # Scoring: 1.0 at target, tapers off
    # We use a broad Gaussian-like curve or simple ratio
    # Professional can be very long, so we handle it more gracefully
    diff = abs(duration_sec - target)
    score = max(0.1, 1.0 - (diff / (target * 1.5)))
    
    return min(1.0, score)


async def search_educational_videos(
    query: str, 
    limit: int = 5, 
    level: Optional[str] = None, 
    style: Optional[str] = None,
    subject: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Search for high-quality, topic-relevant educational videos with smart ranking.
    Prioritizes "Gold" content and level-appropriate duration.
    """
    search_q = _build_search_query(query, level, style, subject)
    logger.info(f"YouTube search query: {search_q}")
    
    params = {
        "part": "snippet",
        "q": search_q,
        "key": YOUTUBE_API_KEY,
        "maxResults": 30,
        "type": "video",
        "videoDuration": "any",
        "videoEmbeddable": "true",
        "relevanceLanguage": "en",
        "safeSearch": "strict",
        "order": "relevance",
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Search for videos
            search_response = await client.get(YOUTUBE_SEARCH_URL, params=params)
            search_response.raise_for_status()
            search_data = search_response.json()
            
            items = search_data.get("items", [])
            if not items:
                return []

            video_ids = [item["id"]["videoId"] for item in items]
            
            # 2. Get detailed statistics (views, likes, dates, duration)
            stats_params = {
                "part": "statistics,snippet,contentDetails",
                "id": ",".join(video_ids),
                "key": YOUTUBE_API_KEY
            }
            stats_response = await client.get(YOUTUBE_VIDEOS_URL, params=stats_params)
            stats_response.raise_for_status()
            stats_data = stats_response.json()
            
            # 3. Filter and rank videos
            now = datetime.now(timezone.utc)
            ranked_videos = []
            
            initial_count = len(stats_data.get("items", []))
            filtered_language = 0
            filtered_relevance = 0
            filtered_duration = 0
            
            for v in stats_data.get("items", []):
                snippet = v["snippet"]
                stats = v["statistics"]
                content = v["contentDetails"] # Added to get duration
                
                title = snippet["title"]
                description = snippet["description"]
                
                # Pre-calculate duration for duration filter
                duration_str = content.get("duration", "PT0S")
                duration_sec = _parse_duration(duration_str)

                # Filter by Language
                if _is_mixed_language(title) or _is_mixed_language(description):
                    logger.debug(f"Filtered out mixed language video: {title}")
                    filtered_language += 1
                    continue
                    
                # Filter by Relevance
                if not _title_is_relevant(title, query):
                    logger.debug(f"Filtered out irrelevant video: {title}")
                    filtered_relevance += 1
                    continue
                
                # Filter by Duration
                duration_score = _calculate_duration_score(duration_sec, level)
                if duration_score == 0: # Filtered by < 6m minimum
                    logger.debug(f"Filtered out short video: {title} ({duration_sec}s)")
                    filtered_duration += 1
                    continue

                # Heuristic scoring components
                views = int(stats.get("viewCount", 0))
                likes = int(stats.get("likeCount", 0))
                
                # 1. Recency Bonus: 12 year window (User wants "Gold" but updated)
                pub_date = datetime.fromisoformat(snippet["publishedAt"].replace("Z", "+00:00"))
                age_days = (now - pub_date).days
                # Very slow decay for the first 5 years, then steeper
                recency_score = max(0, 1 - (age_days / (365 * 12))) 
                
                # 2. Popularity Score: Favors "Impactful" content (Log views + engagement)
                # Views provide a baseline of authority
                view_score = math.log10(views + 1) 
                # Engagement ratio (likes/views) adds quality signal
                engagement_score = (likes / (views + 1)) * 20.0
                
                pop_score = (view_score * 0.7) + (engagement_score * 0.3)
                
                # 3. Final Ranking: 80% Popularity ("Impact"), 20% Recency
                # This ensures old "Gold" videos with millions of views win over new small ones
                final_score = (pop_score * 0.8) + (recency_score * 2.0 * 0.2)
                
                ranked_videos.append({
                    "id": v["id"],
                    "title": title,
                    "thumbnail": snippet["thumbnails"]["high"]["url"],
                    "channel": snippet["channelTitle"],
                    "channel_title": snippet["channelTitle"],
                    "description": description[:200] + "...",
                    "views": views,
                    "published_at": snippet["publishedAt"],
                    "duration": duration_sec,
                    "duration_text": f"{duration_sec // 60}m {duration_sec % 60}s",
                    "score": final_score,
                    "url": f"https://www.youtube.com/watch?v={v['id']}"
                })
            
            # Sort by score descending and take requested limit
            ranked_videos.sort(key=lambda x: x["score"], reverse=True)
            result = ranked_videos[:limit]
            logger.info(f"Returning {len(result)} impactful English videos for topic '{query}'. (Filtered from {initial_count} results: {filtered_language} lang, {filtered_relevance} relevance, {filtered_duration} duration)")
            return result

    except Exception as e:
        logger.error(f"Smart YouTube search failed: {str(e)}")
        return []
