import httpx
from typing import List, Dict, Any, Optional
import logging
import re
import json
import html
from datetime import datetime, timezone
import math
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)

YOUTUBE_API_KEY = settings.YOUTUBE_API_KEY
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
YOUTUBE_WEB_SEARCH_URL = "https://www.youtube.com/results"
DUCKDUCKGO_HTML_SEARCH_URL = "https://duckduckgo.com/html/"
YOUTUBE_MAX_VIDEO_DETAILS_IDS = 50


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _json_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        try:
            import json

            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            return [value.strip()] if value.strip() else []
    return []


async def _load_creator_profiles(db: Optional[AsyncSession]) -> List[Dict[str, Any]]:
    if db is None:
        return []
    try:
        table_check = await db.execute(text("SELECT to_regclass('public.video_creator_profiles')"))
        if table_check.scalar_one_or_none() is None:
            return []
        result = await db.execute(
            text(
                """
                SELECT
                    creator_name,
                    channel_aliases,
                    domains,
                    topic_keywords,
                    recommended_query_terms,
                    community_evidence_count,
                    community_evidence_summary
                FROM video_creator_profiles
                WHERE is_active = TRUE
                ORDER BY sort_order ASC, creator_name ASC
                """
            )
        )
    except Exception as exc:
        logger.warning("Could not load video creator evidence profiles: %s", exc)
        try:
            await db.rollback()
        except Exception:
            logger.debug("Could not roll back failed creator profile lookup", exc_info=True)
        return []

    profiles: List[Dict[str, Any]] = []
    for row in result.mappings().all():
        creator = str(row["creator_name"] or "").strip()
        if not creator:
            continue
        profiles.append(
            {
                "creator": creator,
                "channel_aliases": _json_list(row["channel_aliases"]),
                "domains": _json_list(row["domains"]),
                "topic_keywords": _json_list(row["topic_keywords"]),
                "recommended_query_terms": _json_list(row["recommended_query_terms"]),
                "community_evidence_count": int(row["community_evidence_count"] or 0),
                "community_evidence_summary": row["community_evidence_summary"],
            }
        )
    return profiles


def _matching_creator_evidence(topic: str, subject: Optional[str], profiles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    topic_text = _normalize_name(topic)
    subject_text = _normalize_name(subject or "")
    matches: List[tuple[float, Dict[str, Any]]] = []

    for profile in profiles:
        topic_hits = sum(
            1
            for keyword in profile.get("topic_keywords", [])
            if _normalize_name(keyword) and _normalize_name(keyword) in topic_text
        )
        domain_hits = sum(
            1
            for keyword in profile.get("domains", [])
            if _normalize_name(keyword) and _normalize_name(keyword) in subject_text
        )
        if topic_hits:
            score = (topic_hits * 2.0) + (domain_hits * 1.5) + min(1.2, profile["community_evidence_count"] * 0.08)
            matches.append((score, profile))

    matches.sort(key=lambda item: item[0], reverse=True)
    return [profile for _, profile in matches[:3]]


def _creator_profile_match(channel_title: str, profiles: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    normalized_channel = _normalize_name(channel_title)
    for profile in profiles:
        aliases = [profile.get("creator", ""), *profile.get("channel_aliases", [])]
        for alias in aliases:
            normalized_alias = _normalize_name(alias)
            if normalized_alias and normalized_alias in normalized_channel:
                return profile
    return None


def _expand_search_queries(base_query: str, topic: str, subject: Optional[str], matched_profiles: List[Dict[str, Any]]) -> List[str]:
    queries = [base_query]
    for profile in matched_profiles[:2]:
        creator = profile.get("creator")
        if creator:
            queries.append(f"{subject or ''} {topic} {creator}".strip())
        for term in profile.get("recommended_query_terms", [])[:2]:
            queries.append(f"{subject or ''} {term}".strip())

    seen = set()
    deduped: List[str] = []
    for query in queries:
        normalized = query.strip().lower()
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(query.strip())
    return deduped[:3]


def _clean_video_topic_text(topic: str) -> str:
    text_value = (topic or "").strip()
    text_value = re.sub(r"(?i)\be\s*\.?\s*g\s*\.?", "for example", text_value)
    replacements = {
        "enviroment": "environment",
        "Enviroment": "Environment",
    }
    for wrong, right in replacements.items():
        text_value = text_value.replace(wrong, right)
    text_value = re.sub(r"\s+", " ", text_value)
    text_value = re.sub(r"\s*:\s*", ": ", text_value)
    text_value = re.sub(r"\s*,\s*", ", ", text_value)
    text_value = re.sub(r"\s*\.\s*", ". ", text_value)
    text_value = re.sub(r"\s+", " ", text_value).strip(" .,:;-")

    intro_match = re.match(r"(?i)^introduction\s+to\s+[^:]{2,90}:\s*(.+)$", text_value)
    if intro_match:
        text_value = intro_match.group(1).strip()

    return text_value or "the lesson topic"


def _video_search_phrase(topic: str, subject: Optional[str]) -> str:
    topic_text = _clean_video_topic_text(topic)
    topic_text = re.split(r"(?i)\b(?:e\.\s*g\.?|for example|such as)\b", topic_text, maxsplit=1)[0]
    topic_text = re.sub(r"(?i)\betc\.?$", "", topic_text).strip(" .,:;-")
    subject_text = (subject or "").strip()

    if subject_text and _normalize_name(subject_text) not in _normalize_name(topic_text):
        return f"{subject_text} {topic_text} explained"
    return f"{topic_text} explained"


def _video_fallback_title(topic: str, creator: str) -> str:
    topic_text = _clean_video_topic_text(topic)
    topic_text = re.split(r"(?i)\b(?:e\.\s*g\.?|for example|such as)\b", topic_text, maxsplit=1)[0]
    topic_text = re.sub(r"(?i)\betc\.?$", "", topic_text).strip(" .,:;-")
    topic_text = topic_text[:1].lower() + topic_text[1:] if topic_text else "this lesson"
    if creator != "YouTube search guide":
        return f"Find a clear video on {topic_text} with {creator}"
    return f"Find a clear video on {topic_text}"


def _build_youtube_search_fallbacks(
    topic: str,
    subject: Optional[str],
    level: Optional[str],
    matched_profiles: List[Dict[str, Any]],
    limit: int,
) -> List[Dict[str, Any]]:
    primary_topic = _clean_video_topic_text(topic)
    subject_text = subject or "this subject"
    candidates = matched_profiles[: max(1, limit)]
    if not candidates:
        candidates = [
            {
            "creator": "YouTube search guide",
            "recommended_query_terms": [_video_search_phrase(primary_topic, subject_text)],
            "community_evidence_count": 0,
            "community_evidence_summary": "Last-resort search guide used only when no playable video result could be fetched.",
            }
        ]

    fallbacks: List[Dict[str, Any]] = []
    for index, profile in enumerate(candidates):
        creator = profile.get("creator") or "YouTube search guide"
        query_term = (profile.get("recommended_query_terms") or [None])[0] or _video_search_phrase(primary_topic, subject_text)
        if creator != "YouTube search guide":
            search_query = f"{_video_search_phrase(primary_topic, subject_text)} {creator}".strip()
            title = _video_fallback_title(primary_topic, creator)
        else:
            search_query = query_term
            title = _video_fallback_title(primary_topic, creator)

        why = [
            "EduNexus prepared a focused YouTube search path for this lesson",
            f"Community evidence points toward {creator} for this kind of topic"
            if creator != "YouTube search guide"
            else "This search is shaped from the lesson topic and subject context",
        ]
        if level:
            why.append(f"Search tuned for {level.replace('_', ' ')} level explanations")

        fallbacks.append(
            {
                "id": f"search-fallback-{index}-{_normalize_name(search_query).replace(' ', '-')[:40]}",
                "title": title,
                "thumbnail": "",
                "channel": creator,
                "channel_title": creator,
                "description": f"Open a YouTube search for {search_query} and choose the clearest explanation that fits your pace.",
                "views": 0,
                "published_at": None,
                "duration": 0,
                "duration_text": "Search guide",
                "score": 0.1,
                "url": f"https://www.youtube.com/results?search_query={quote_plus(search_query)}",
                "why_recommended": why[:3],
                "community_evidence": {
                    "creator": creator,
                    "community_evidence_count": int(profile.get("community_evidence_count") or 0),
                    "community_evidence_summary": profile.get("community_evidence_summary"),
                },
                "platform_evidence": {
                    "impressions": 0,
                    "clicks": 0,
                    "watch_starts": 0,
                    "watch_60s": 0,
                    "watch_completions": 0,
                    "likes": 0,
                    "dislikes": 0,
                },
                "learner_feedback": None,
                "audio_language": "en-search",
                "is_search_fallback": True,
                "needs_refresh": True,
                "search_query": search_query,
            }
        )
    return fallbacks[:limit]


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
    title_words = set(re.split(r'\W+', title_lower))

    # Extract meaningful words (3+ chars, skip common stopwords)
    stopwords = {
        "the", "and", "for", "with", "from", "into", "about", "using",
        "how", "what", "why", "this", "that", "techniques", "analysis",
        "project", "development", "real", "world", "one",
    }
    topic_words = [w for w in re.split(r'\W+', topic_lower) if len(w) >= 3 and w not in stopwords]

    if not topic_words:
        return True

    topic_phrases = [
        phrase
        for phrase in re.findall(r"[a-z0-9]+(?:\s+[a-z0-9]+)+", topic_lower)
        if len(phrase.split()) >= 2
    ]
    if any(phrase in title_lower for phrase in topic_phrases):
        return True

    # Count how many topic keywords appear in the title
    matches = sum(
        1
        for word in topic_words
        if word in title_words or (word.endswith("s") and word[:-1] in title_words)
    )
    
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


def _extract_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        simple = value.get("simpleText")
        if isinstance(simple, str):
            return simple.strip()
        runs = value.get("runs")
        if isinstance(runs, list):
            return "".join(str(run.get("text") or "") for run in runs if isinstance(run, dict)).strip()
    return ""


def _parse_count_text(value: str) -> int:
    text_value = (value or "").lower().replace(",", "").strip()
    match = re.search(r"(\d+(?:\.\d+)?)\s*([kmb])?", text_value)
    if not match:
        return 0
    amount = float(match.group(1))
    multiplier = {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}.get(match.group(2) or "", 1)
    return int(amount * multiplier)


def _parse_length_text(value: str) -> int:
    parts = [int(part) for part in re.findall(r"\d+", value or "")]
    if not parts:
        return 0
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return parts[-3] * 3600 + parts[-2] * 60 + parts[-1]


def _web_duration_score(duration_sec: int, level: Optional[str]) -> float:
    if duration_sec <= 0:
        return 0.55
    if duration_sec < 90:
        return 0.0
    if level and any(marker in level.lower() for marker in ("pre", "creche", "primary")):
        if duration_sec < 150:
            return 0.25
        return min(1.0, max(0.35, 900 / max(duration_sec, 900)))
    return _calculate_duration_score(duration_sec, level) or 0.25


def _video_card(
    *,
    video_id: str,
    title: str,
    channel_title: str,
    description: str = "",
    thumbnail: str = "",
    duration_sec: int = 0,
    duration_text: str = "Video lesson",
    views: int = 0,
    published_at: Optional[str] = None,
    score: float = 1.0,
    why_recommended: Optional[List[str]] = None,
    community_evidence: Optional[Dict[str, Any]] = None,
    source: str = "youtube_web_search",
) -> Dict[str, Any]:
    thumbnail_url = thumbnail or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    return {
        "id": video_id,
        "title": title,
        "thumbnail": thumbnail_url,
        "channel": channel_title,
        "channel_title": channel_title,
        "description": description[:220],
        "views": views,
        "published_at": published_at,
        "duration": duration_sec,
        "duration_text": duration_text,
        "score": score,
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "why_recommended": (why_recommended or ["Found from a live online search for this lesson"])[:3],
        "community_evidence": community_evidence,
        "platform_evidence": {
            "impressions": 0,
            "clicks": 0,
            "watch_starts": 0,
            "watch_60s": 0,
            "watch_completions": 0,
            "likes": 0,
            "dislikes": 0,
        },
        "learner_feedback": None,
        "is_search_fallback": False,
        "source": source,
    }


def _iter_video_renderers(value: Any) -> List[Dict[str, Any]]:
    renderers: List[Dict[str, Any]] = []
    if isinstance(value, dict):
        renderer = value.get("videoRenderer")
        if isinstance(renderer, dict):
            renderers.append(renderer)
        for child in value.values():
            renderers.extend(_iter_video_renderers(child))
    elif isinstance(value, list):
        for child in value:
            renderers.extend(_iter_video_renderers(child))
    return renderers


def _extract_yt_initial_data(html_text: str) -> Optional[Dict[str, Any]]:
    marker_index = html_text.find("ytInitialData")
    if marker_index < 0:
        return None
    start_index = html_text.find("{", marker_index)
    if start_index < 0:
        return None

    depth = 0
    in_string = False
    escape = False
    for index in range(start_index, len(html_text)):
        char = html_text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html_text[start_index : index + 1])
                except json.JSONDecodeError:
                    return None
    return None


async def _search_youtube_web_videos(
    search_queries: List[str],
    topic: str,
    subject: Optional[str],
    level: Optional[str],
    matched_profiles: List[Dict[str, Any]],
    limit: int,
) -> List[Dict[str, Any]]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    ranked_videos: List[Dict[str, Any]] = []
    seen_video_ids = set()
    topic_for_relevance = _video_search_phrase(topic, subject).replace(" explained", "")

    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
        for search_query in search_queries[:3]:
            response = await client.get(YOUTUBE_WEB_SEARCH_URL, params={"search_query": search_query})
            response.raise_for_status()
            initial_data = _extract_yt_initial_data(response.text)
            if not initial_data:
                continue

            for renderer in _iter_video_renderers(initial_data):
                video_id = str(renderer.get("videoId") or "").strip()
                if not video_id or video_id in seen_video_ids:
                    continue
                seen_video_ids.add(video_id)

                title = _extract_text(renderer.get("title"))
                if not title or _is_mixed_language(title) or not _title_is_relevant(title, topic_for_relevance):
                    continue

                channel_title = _extract_text(renderer.get("ownerText")) or _extract_text(renderer.get("shortBylineText"))
                duration_text = _extract_text(renderer.get("lengthText")) or "Video lesson"
                duration_sec = _parse_length_text(duration_text)
                duration_score = _web_duration_score(duration_sec, level)
                if duration_score <= 0:
                    continue

                view_text = _extract_text(renderer.get("viewCountText"))
                views = _parse_count_text(view_text)
                thumbnails = (renderer.get("thumbnail") or {}).get("thumbnails") or []
                thumbnail = ""
                if thumbnails:
                    thumbnail = str((thumbnails[-1] or {}).get("url") or "")
                    if thumbnail.startswith("//"):
                        thumbnail = f"https:{thumbnail}"

                matched_profile = _creator_profile_match(channel_title, matched_profiles)
                score = math.log10(views + 1) * 0.75 + duration_score
                why_recommended = ["Found from a live YouTube search for this lesson"]
                community_evidence = None
                if matched_profile:
                    score += 1.8 + min(1.2, matched_profile["community_evidence_count"] * 0.12)
                    why_recommended.append("Trusted creator evidence matched this topic")
                    community_evidence = {
                        "creator": matched_profile["creator"],
                        "community_evidence_count": matched_profile["community_evidence_count"],
                        "community_evidence_summary": matched_profile["community_evidence_summary"],
                    }
                if duration_score >= 0.55:
                    why_recommended.append("Duration looks suitable for this learner level")
                why_recommended.append("Title matches the lesson topic")

                ranked_videos.append(
                    _video_card(
                        video_id=video_id,
                        title=title,
                        thumbnail=thumbnail,
                        channel_title=channel_title,
                        description=_extract_text(renderer.get("descriptionSnippet")),
                        views=views,
                        published_at=_extract_text(renderer.get("publishedTimeText")) or None,
                        duration_sec=duration_sec,
                        duration_text=duration_text,
                        score=score,
                        why_recommended=why_recommended,
                        community_evidence=community_evidence,
                        source="youtube_web_search",
                    )
                )
                if len(ranked_videos) >= limit * 4:
                    break
            if len(ranked_videos) >= limit * 2:
                break

    ranked_videos.sort(key=lambda item: item["score"], reverse=True)
    return ranked_videos[:limit]


def _extract_youtube_video_id(url: str) -> Optional[str]:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if "duckduckgo.com" in host:
        target = parse_qs(parsed.query).get("uddg", [None])[0]
        if target:
            return _extract_youtube_video_id(unquote(target))
    if "youtu.be" in host:
        candidate = parsed.path.strip("/").split("/")[0]
        return candidate if re.fullmatch(r"[\w-]{11}", candidate or "") else None
    if "youtube.com" in host:
        if parsed.path == "/watch":
            candidate = parse_qs(parsed.query).get("v", [None])[0]
            return candidate if re.fullmatch(r"[\w-]{11}", candidate or "") else None
        shorts_match = re.search(r"/shorts/([\w-]{11})", parsed.path)
        if shorts_match:
            return shorts_match.group(1)
    return None


def _clean_search_result_title(title: str) -> str:
    title_value = html.unescape(re.sub(r"<[^>]+>", " ", title or ""))
    title_value = re.sub(r"\s+", " ", title_value).strip()
    title_value = re.sub(r"\s*-\s*YouTube$", "", title_value, flags=re.IGNORECASE).strip()
    return title_value


async def _enrich_video_from_oembed(client: httpx.AsyncClient, video_id: str, fallback_title: str) -> Dict[str, str]:
    title = fallback_title
    channel_title = "YouTube"
    try:
        response = await client.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
            timeout=8.0,
        )
        if response.status_code == 200:
            data = response.json()
            title = str(data.get("title") or title).strip() or title
            channel_title = str(data.get("author_name") or channel_title).strip() or channel_title
    except Exception:
        logger.debug("Could not enrich YouTube video %s through oEmbed", video_id, exc_info=True)
    return {"title": title, "channel_title": channel_title}


async def _search_youtube_indexed_videos(
    search_queries: List[str],
    topic: str,
    subject: Optional[str],
    level: Optional[str],
    matched_profiles: List[Dict[str, Any]],
    limit: int,
) -> List[Dict[str, Any]]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    topic_for_relevance = _video_search_phrase(topic, subject).replace(" explained", "")
    ranked_videos: List[Dict[str, Any]] = []
    seen_video_ids = set()

    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
        for search_query in search_queries[:3]:
            index_query = f"site:youtube.com/watch {search_query}"
            response = await client.get(DUCKDUCKGO_HTML_SEARCH_URL, params={"q": index_query})
            response.raise_for_status()
            anchors = re.findall(
                r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
                response.text,
                flags=re.IGNORECASE | re.DOTALL,
            )
            if not anchors:
                anchors = re.findall(
                    r'<a[^>]+href="([^"]*(?:youtube\.com/watch|youtu\.be/)[^"]+)"[^>]*>(.*?)</a>',
                    response.text,
                    flags=re.IGNORECASE | re.DOTALL,
                )

            for href, raw_title in anchors:
                video_id = _extract_youtube_video_id(html.unescape(href))
                if not video_id or video_id in seen_video_ids:
                    continue
                seen_video_ids.add(video_id)

                title = _clean_search_result_title(raw_title)
                enriched = await _enrich_video_from_oembed(client, video_id, title)
                title = enriched["title"]
                if not title or _is_mixed_language(title) or not _title_is_relevant(title, topic_for_relevance):
                    continue

                channel_title = enriched["channel_title"]
                matched_profile = _creator_profile_match(channel_title, matched_profiles)
                score = 1.0 + max(0, len(search_queries) - search_queries.index(search_query)) * 0.2
                why_recommended = ["Found from a live web search for YouTube lessons"]
                community_evidence = None
                if matched_profile:
                    score += 1.8 + min(1.2, matched_profile["community_evidence_count"] * 0.12)
                    why_recommended.append("Trusted creator evidence matched this topic")
                    community_evidence = {
                        "creator": matched_profile["creator"],
                        "community_evidence_count": matched_profile["community_evidence_count"],
                        "community_evidence_summary": matched_profile["community_evidence_summary"],
                    }
                why_recommended.append("Title matches the lesson topic")

                ranked_videos.append(
                    _video_card(
                        video_id=video_id,
                        title=title,
                        channel_title=channel_title,
                        duration_text="Video lesson",
                        score=score,
                        why_recommended=why_recommended,
                        community_evidence=community_evidence,
                        source="youtube_index_search",
                    )
                )
                if len(ranked_videos) >= limit * 2:
                    break
            if len(ranked_videos) >= limit:
                break

    ranked_videos.sort(key=lambda item: item["score"], reverse=True)
    return ranked_videos[:limit]


async def search_educational_videos(
    query: str, 
    limit: int = 5, 
    level: Optional[str] = None, 
    style: Optional[str] = None,
    subject: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> List[Dict[str, Any]]:
    """
    Search for high-quality, topic-relevant educational videos with smart ranking.
    Prioritizes "Gold" content and level-appropriate duration.
    """
    creator_profiles = await _load_creator_profiles(db)
    matched_profiles = _matching_creator_evidence(query, subject, creator_profiles)
    search_q = _build_search_query(query, level, style, subject)
    search_queries = _expand_search_queries(search_q, query, subject, matched_profiles)
    logger.info("YouTube search queries for '%s': %s", query, search_queries)

    if not YOUTUBE_API_KEY:
        logger.info("YouTube API key missing; using direct YouTube web search fallback.")
        web_search_q = _video_search_phrase(query, subject)
        web_search_queries = _expand_search_queries(web_search_q, _clean_video_topic_text(query), subject, matched_profiles)
        try:
            web_results = await _search_youtube_web_videos(web_search_queries, query, subject, level, matched_profiles, limit)
            if web_results:
                logger.info("Returning %s direct YouTube web-search recommendations for topic '%s'.", len(web_results), query)
                return web_results
        except Exception as exc:
            logger.warning("Direct YouTube web search fallback failed: %s", exc)
        try:
            indexed_results = await _search_youtube_indexed_videos(web_search_queries, query, subject, level, matched_profiles, limit)
            if indexed_results:
                logger.info("Returning %s indexed YouTube recommendations for topic '%s'.", len(indexed_results), query)
                return indexed_results
        except Exception as exc:
            logger.warning("Indexed YouTube search fallback failed: %s", exc)
        return _build_youtube_search_fallbacks(query, subject, level, matched_profiles, limit)
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            items = []
            seen_video_ids = set()
            for ranked_query in search_queries:
                params = {
                    "part": "snippet",
                    "q": ranked_query,
                    "key": YOUTUBE_API_KEY,
                    "maxResults": 30 if ranked_query == search_q else 12,
                    "type": "video",
                    "videoDuration": "any",
                    "videoEmbeddable": "true",
                    "relevanceLanguage": "en",
                    "safeSearch": "strict",
                    "order": "relevance",
                }
                search_response = await client.get(YOUTUBE_SEARCH_URL, params=params)
                search_response.raise_for_status()
                search_data = search_response.json()
                for item in search_data.get("items", []):
                    video_id = (item.get("id") or {}).get("videoId")
                    if video_id and video_id not in seen_video_ids:
                        seen_video_ids.add(video_id)
                        items.append(item)

            if not items:
                return _build_youtube_search_fallbacks(query, subject, level, matched_profiles, limit)

            video_ids = [item["id"]["videoId"] for item in items[:YOUTUBE_MAX_VIDEO_DETAILS_IDS]]
            
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
                matched_profile = _creator_profile_match(snippet.get("channelTitle", ""), matched_profiles)
                why_recommended = []
                community_evidence = None
                if matched_profile:
                    final_score += 1.8 + min(1.2, matched_profile["community_evidence_count"] * 0.12)
                    why_recommended.append("Trusted creator evidence matched this topic")
                    community_evidence = {
                        "creator": matched_profile["creator"],
                        "community_evidence_count": matched_profile["community_evidence_count"],
                        "community_evidence_summary": matched_profile["community_evidence_summary"],
                    }
                if duration_score >= 0.75:
                    why_recommended.append("Strong duration fit for this learner level")
                why_recommended.append("Title matches the lesson topic")
                
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
                    "url": f"https://www.youtube.com/watch?v={v['id']}",
                    "why_recommended": why_recommended[:3],
                    "community_evidence": community_evidence,
                    "platform_evidence": {
                        "impressions": 0,
                        "clicks": 0,
                        "watch_starts": 0,
                        "watch_60s": 0,
                        "watch_completions": 0,
                        "likes": 0,
                        "dislikes": 0,
                    },
                    "learner_feedback": None,
                    "is_search_fallback": False,
                })
            
            # Sort by score descending and take requested limit
            ranked_videos.sort(key=lambda x: x["score"], reverse=True)
            result = ranked_videos[:limit]
            if not result:
                return _build_youtube_search_fallbacks(query, subject, level, matched_profiles, limit)
            logger.info(f"Returning {len(result)} impactful English videos for topic '{query}'. (Filtered from {initial_count} results: {filtered_language} lang, {filtered_relevance} relevance, {filtered_duration} duration)")
            return result

    except Exception as e:
        logger.error(f"Smart YouTube search failed: {str(e)}")
        return _build_youtube_search_fallbacks(query, subject, level, matched_profiles, limit)
