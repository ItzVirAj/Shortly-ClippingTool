"""
YouTube Direct Integration Module for Shortly
Handles OAuth 2.0 flow, token storage & refresh, channel metrics,
recent videos, and direct video uploads via YouTube Data API v3 without third-party services.
"""

import os
import json
import time
import urllib.parse
from typing import Optional, Dict, Any, List, Tuple
import httpx

# Default YouTube Scopes
YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]

# Paths for storing credentials locally (ignored by git)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, ".shortly_yt_config.json")
TOKENS_FILE = os.path.join(BASE_DIR, ".shortly_yt_tokens.json")


def get_client_credentials() -> Tuple[Optional[str], Optional[str]]:
    """Retrieve Client ID and Client Secret from env or local config file."""
    client_id = os.environ.get("YOUTUBE_CLIENT_ID")
    client_secret = os.environ.get("YOUTUBE_CLIENT_SECRET")
    
    if (not client_id or not client_secret) and os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                client_id = client_id or data.get("client_id")
                client_secret = client_secret or data.get("client_secret")
        except Exception as e:
            print(f"⚠️ Error reading {CONFIG_FILE}: {e}")
            
    return (client_id.strip() if client_id else None, 
            client_secret.strip() if client_secret else None)


def save_client_credentials(client_id: str, client_secret: str) -> bool:
    """Save Client ID and Secret to local config file."""
    try:
        data = {
            "client_id": client_id.strip(),
            "client_secret": client_secret.strip(),
            "updated_at": time.time(),
        }
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"❌ Failed to save YouTube credentials: {e}")
        return False


def load_tokens() -> Optional[Dict[str, Any]]:
    """Load stored OAuth tokens from disk."""
    if not os.path.exists(TOKENS_FILE):
        return None
    try:
        with open(TOKENS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ Error reading {TOKENS_FILE}: {e}")
        return None


def save_tokens(tokens_data: Dict[str, Any]) -> bool:
    """Save tokens to disk."""
    try:
        existing = load_tokens() or {}
        existing.update(tokens_data)
        existing["updated_at"] = time.time()
        with open(TOKENS_FILE, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2)
        return True
    except Exception as e:
        print(f"❌ Failed to save YouTube tokens: {e}")
        return False


def revoke_tokens() -> bool:
    """Revoke tokens and remove local token file."""
    tokens = load_tokens()
    if tokens:
        token = tokens.get("access_token") or tokens.get("refresh_token")
        if token:
            try:
                # Best-effort revocation
                httpx.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": token},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=10.0,
                )
            except Exception as e:
                print(f"⚠️ Failed to call Google revoke: {e}")
                
    if os.path.exists(TOKENS_FILE):
        try:
            os.remove(TOKENS_FILE)
        except Exception:
            pass
    return True


def build_auth_url(redirect_uri: str, state: Optional[str] = None) -> str:
    """Build the Google OAuth 2.0 authorization URL."""
    client_id, _ = get_client_credentials()
    if not client_id:
        raise ValueError("YouTube Client ID is not configured. Please add it in Settings.")

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(YOUTUBE_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    if state:
        params["state"] = state

    return f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"


async def exchange_code(code: str, redirect_uri: str) -> Dict[str, Any]:
    """Exchange authorization code for access and refresh tokens."""
    client_id, client_secret = get_client_credentials()
    if not client_id or not client_secret:
        raise ValueError("YouTube Client ID or Client Secret is missing.")

    payload = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data=payload)
        if resp.status_code != 200:
            raise ValueError(f"Token exchange failed ({resp.status_code}): {resp.text}")
        
        token_data = resp.json()
        expires_in = token_data.get("expires_in", 3600)
        token_data["expires_at"] = time.time() + expires_in
        save_tokens(token_data)
        
        # Immediately fetch channel info to store username/avatar for fast status response
        try:
            channel_info = await get_channel_info(token_data.get("access_token"))
            if channel_info:
                save_tokens({"channel": channel_info})
        except Exception as e:
            print(f"⚠️ Initial channel fetch warning: {e}")

        return token_data


async def get_valid_access_token() -> str:
    """Return a valid access token, automatically refreshing if expired or expiring soon."""
    tokens = load_tokens()
    if not tokens or not tokens.get("access_token"):
        raise ValueError("YouTube account is not connected. Please connect your account first.")

    access_token = tokens.get("access_token")
    expires_at = tokens.get("expires_at", 0)
    refresh_token = tokens.get("refresh_token")

    # If token expires within 5 minutes, refresh it
    if time.time() > (expires_at - 300):
        if not refresh_token:
            print("⚠️ No refresh token available; using current access token.")
            return access_token

        client_id, client_secret = get_client_credentials()
        if not client_id or not client_secret:
            return access_token

        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post("https://oauth2.googleapis.com/token", data=payload)
            if resp.status_code == 200:
                new_data = resp.json()
                new_access_token = new_data.get("access_token")
                expires_in = new_data.get("expires_in", 3600)
                tokens["access_token"] = new_access_token
                tokens["expires_at"] = time.time() + expires_in
                save_tokens(tokens)
                return new_access_token
            else:
                print(f"⚠️ Token refresh failed ({resp.status_code}): {resp.text}")

    return access_token


async def get_channel_info(token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Fetch authenticated user's YouTube channel details."""
    access_token = token or await get_valid_access_token()

    url = "https://www.googleapis.com/youtube/v3/channels"
    params = {
        "part": "snippet,statistics,contentDetails,brandingSettings",
        "mine": "true",
    }
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params=params, headers=headers)
        if resp.status_code != 200:
            print(f"❌ YouTube channels.list error ({resp.status_code}): {resp.text}")
            return None

        data = resp.json()
        items = data.get("items", [])
        if not items:
            return None

        channel = items[0]
        snippet = channel.get("snippet", {})
        stats = channel.get("statistics", {})
        branding = channel.get("brandingSettings", {})
        content_details = channel.get("contentDetails", {})

        banner_url = (
            branding.get("image", {}).get("bannerExternalUrl")
            or branding.get("channel", {}).get("bannerImageUrl")
        )

        return {
            "id": channel.get("id"),
            "title": snippet.get("title"),
            "custom_url": snippet.get("customUrl"),
            "handle": snippet.get("customUrl") or f"@{snippet.get('title', '').replace(' ', '').lower()}",
            "description": snippet.get("description"),
            "published_at": snippet.get("publishedAt"),
            "avatar": (
                snippet.get("thumbnails", {}).get("high", {}).get("url")
                or snippet.get("thumbnails", {}).get("medium", {}).get("url")
                or snippet.get("thumbnails", {}).get("default", {}).get("url")
            ),
            "banner": banner_url,
            "subscribers": int(stats.get("subscriberCount", 0)),
            "views": int(stats.get("viewCount", 0)),
            "video_count": int(stats.get("videoCount", 0)),
            "hidden_subscribers": stats.get("hiddenSubscriberCount", False),
            "uploads_playlist": content_details.get("relatedPlaylists", {}).get("uploads"),
        }


async def get_channel_videos(max_results: int = 25) -> List[Dict[str, Any]]:
    """Fetch recent uploaded videos and Shorts for the authenticated channel."""
    access_token = await get_valid_access_token()
    
    # 1. Get uploads playlist id
    channel_info = await get_channel_info(access_token)
    if not channel_info or not channel_info.get("uploads_playlist"):
        return []

    uploads_playlist_id = channel_info["uploads_playlist"]

    # 2. Get playlist items
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        playlist_url = "https://www.googleapis.com/youtube/v3/playlistItems"
        p_params = {
            "part": "snippet,contentDetails",
            "playlistId": uploads_playlist_id,
            "maxResults": min(max_results, 50),
        }
        p_resp = await client.get(playlist_url, params=p_params, headers=headers)
        if p_resp.status_code != 200:
            print(f"❌ Failed to fetch playlist items: {p_resp.text}")
            return []

        p_data = p_resp.json()
        items = p_data.get("items", [])
        if not items:
            return []

        video_ids = [item["contentDetails"]["videoId"] for item in items if "contentDetails" in item]
        if not video_ids:
            return []

        # 3. Get detailed video stats & duration
        v_url = "https://www.googleapis.com/youtube/v3/videos"
        v_params = {
            "part": "snippet,statistics,contentDetails,status",
            "id": ",".join(video_ids),
        }
        v_resp = await client.get(v_url, params=v_params, headers=headers)
        if v_resp.status_code != 200:
            print(f"❌ Failed to fetch video details: {v_resp.text}")
            return []

        v_data = v_resp.json()
        video_items = v_data.get("items", [])

        results = []
        for v in video_items:
            v_id = v.get("id")
            s = v.get("snippet", {})
            st = v.get("statistics", {})
            cd = v.get("contentDetails", {})
            status = v.get("status", {})

            # Parse ISO duration (e.g. PT58S, PT1M12S)
            duration_iso = cd.get("duration", "")
            duration_sec = parse_iso_duration(duration_iso)

            # Detect if Short (<= 60s or title contains #shorts)
            title = s.get("title", "")
            is_short = (duration_sec > 0 and duration_sec <= 60) or "#short" in title.lower()

            thumbnails = s.get("thumbnails", {})
            thumb_url = (
                thumbnails.get("maxres", {}).get("url")
                or thumbnails.get("high", {}).get("url")
                or thumbnails.get("medium", {}).get("url")
                or thumbnails.get("default", {}).get("url")
            )

            results.append({
                "id": v_id,
                "video_id": v_id,
                "title": title,
                "description": s.get("description", ""),
                "published_at": s.get("publishedAt"),
                "thumbnail": thumb_url,
                "duration": duration_iso,
                "duration_seconds": duration_sec,
                "is_short": is_short,
                "views": int(st.get("viewCount", 0)),
                "likes": int(st.get("likeCount", 0)),
                "comments": int(st.get("commentCount", 0)),
                "privacy": status.get("privacyStatus", "public"),
                "url": f"https://www.youtube.com/watch?v={v_id}" if not is_short else f"https://www.youtube.com/shorts/{v_id}",
            })

        return results


def parse_iso_duration(duration: str) -> int:
    """Convert ISO 8601 duration string (e.g. PT1M23S) into seconds."""
    if not duration.startswith("PT"):
        return 0
    duration = duration[2:]
    hours = 0
    minutes = 0
    seconds = 0
    current = ""
    for char in duration:
        if char.isdigit():
            current += char
        elif char == "H":
            hours = int(current) if current else 0
            current = ""
        elif char == "M":
            minutes = int(current) if current else 0
            current = ""
        elif char == "S":
            seconds = int(current) if current else 0
            current = ""
    return (hours * 3600) + (minutes * 60) + seconds


async def upload_video_to_youtube(
    file_path: str,
    title: str,
    description: str = "",
    tags: Optional[List[str]] = None,
    category_id: str = "22",
    privacy: str = "public",
    thumbnail_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Directly upload a video file to YouTube via YouTube Data API v3 Resumable Upload.
    Returns the created video details including video ID and watch URL.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Video file not found: {file_path}")

    access_token = await get_valid_access_token()
    file_size = os.path.getsize(file_path)

    # 1. Step 1: Initialize Resumable Upload
    metadata = {
        "snippet": {
            "title": title[:100],  # YouTube title limit 100 chars
            "description": description[:5000],
            "tags": tags or ["#Shorts", "Shortly"],
            "categoryId": str(category_id),
        },
        "status": {
            "privacyStatus": privacy if privacy in ("public", "private", "unlisted") else "public",
            "selfDeclaredMadeForKids": False,
        },
    }

    init_headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": str(file_size),
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        init_resp = await client.post(
            "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
            headers=init_headers,
            json=metadata,
        )

        if init_resp.status_code != 200:
            raise ValueError(f"Failed to initialize YouTube upload ({init_resp.status_code}): {init_resp.text}")

        upload_url = init_resp.headers.get("Location")
        if not upload_url:
            raise ValueError("Google API did not return an upload Location header.")

        # 2. Step 2: Upload Video File Content
        with open(file_path, "rb") as video_file:
            content = video_file.read()

        upload_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "video/mp4",
            "Content-Length": str(file_size),
        }

        # Generous timeout for video upload based on file size (at least 300s)
        upload_timeout = max(300.0, float(file_size) / (50 * 1024))  # 50 KB/s min estimate

        up_client = httpx.AsyncClient(timeout=upload_timeout)
        try:
            up_resp = await up_client.put(upload_url, headers=upload_headers, content=content)
            if up_resp.status_code not in (200, 201):
                raise ValueError(f"YouTube upload transfer failed ({up_resp.status_code}): {up_resp.text}")

            video_data = up_resp.json()
            video_id = video_data.get("id")
        finally:
            await up_client.aclose()

        # 3. Step 3: Optional Custom Thumbnail
        if thumbnail_path and os.path.exists(thumbnail_path) and video_id:
            try:
                thumb_size = os.path.getsize(thumbnail_path)
                with open(thumbnail_path, "rb") as thumb_f:
                    thumb_bytes = thumb_f.read()

                thumb_headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "image/jpeg" if thumbnail_path.lower().endswith((".jpg", ".jpeg")) else "image/png",
                    "Content-Length": str(thumb_size),
                }

                thumb_resp = await client.post(
                    f"https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={video_id}",
                    headers=thumb_headers,
                    content=thumb_bytes,
                )
                if thumb_resp.status_code in (200, 201):
                    print(f"✅ Thumbnail set for YouTube video {video_id}")
                else:
                    print(f"⚠️ Could not set thumbnail ({thumb_resp.status_code}): {thumb_resp.text}")
            except Exception as e:
                print(f"⚠️ Thumbnail upload exception: {e}")

        # Check if Short
        is_short = "#short" in title.lower() or (file_size < 15 * 1024 * 1024)
        watch_url = f"https://www.youtube.com/shorts/{video_id}" if is_short else f"https://www.youtube.com/watch?v={video_id}"

        return {
            "success": True,
            "video_id": video_id,
            "url": watch_url,
            "title": title,
            "privacy": privacy,
        }
