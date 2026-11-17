"""Automated Cloudflare Quick Tunnel and Kick Webhook Event Subscription Manager."""
import asyncio
import logging
import os
from typing import Any, Dict, Optional
import httpx

logger = logging.getLogger("live_clipper.tunnel")

KICK_AUTH_URL = "https://id.kick.com/oauth/token"
KICK_API_BASE = "https://api.kick.com/public/v1"


class TunnelManager:
    """Manages zero-config Cloudflare Quick Tunnel (cloudflared) for incoming webhooks."""

    def __init__(self, default_port: int = 8000) -> None:
        self.default_port = default_port
        self._tunnel_url: Optional[str] = None
        self._running_port: Optional[int] = None

    @property
    def tunnel_url(self) -> Optional[str]:
        # Allow static override via environment
        env_url = os.environ.get("KICK_WEBHOOK_URL", "").strip().rstrip("/")
        if env_url:
            return env_url
        return self._tunnel_url

    def start_tunnel(self, port: Optional[int] = None) -> str:
        """Launch Cloudflare Quick Tunnel to expose local backend to the internet."""
        env_url = os.environ.get("KICK_WEBHOOK_URL", "").strip().rstrip("/")
        if env_url:
            self._tunnel_url = env_url
            return env_url

        target_port = port or self.default_port
        if self._tunnel_url and self._running_port == target_port:
            return self._tunnel_url

        try:
            import pycloudflared
            urls = pycloudflared.try_cloudflare(target_port, verbose=False)
            self._tunnel_url = urls.tunnel.rstrip("/")
            self._running_port = target_port
            logger.info(f"Cloudflare Quick Tunnel active at: {self._tunnel_url}")
            return self._tunnel_url
        except Exception as e:
            logger.error(f"Failed to start Cloudflare tunnel: {e}")
            raise RuntimeError(f"Could not start automated Cloudflare tunnel: {e}")

    def stop_tunnel(self) -> None:
        """Safely terminate the running Cloudflare tunnel process."""
        if not self._running_port:
            return
        try:
            import pycloudflared
            pycloudflared.try_cloudflare.terminate(self._running_port)
            logger.info(f"Cloudflare Quick Tunnel on port {self._running_port} terminated.")
        except Exception as e:
            logger.warning(f"Error terminating Cloudflare tunnel: {e}")
        finally:
            self._tunnel_url = None
            self._running_port = None


class KickApiManager:
    """Automates Kick OAuth token retrieval and webhook event subscriptions."""

    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0

    @property
    def is_configured(self) -> bool:
        """Check if Kick Client ID and Secret are configured in environment."""
        cid = os.environ.get("KICK_CLIENT_ID", "").strip()
        sec = os.environ.get("KICK_CLIENT_SECRET", "").strip()
        return bool(cid and sec)

    async def get_app_token(self) -> Optional[str]:
        """Obtain OAuth 2.0 app access token via client_credentials grant."""
        if not self.is_configured:
            return None

        client_id = os.environ["KICK_CLIENT_ID"].strip()
        client_secret = os.environ["KICK_CLIENT_SECRET"].strip()

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.post(
                    KICK_AUTH_URL,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                if res.status_code == 200:
                    data = res.json()
                    self._token = data.get("access_token")
                    return self._token
                else:
                    logger.error(f"Kick OAuth failed ({res.status_code}): {res.text}")
                    return None
            except Exception as e:
                logger.error(f"Failed to contact Kick OAuth endpoint: {e}")
                return None

    async def get_broadcaster_id(self, slug: str, token: Optional[str] = None) -> Optional[int]:
        """Resolve channel slug to Kick broadcaster_user_id."""
        if not token:
            token = await self.get_app_token()

        # 1. Try public v1 channels endpoint
        if token:
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    res = await client.get(
                        f"{KICK_API_BASE}/channels?slug={slug}",
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    if res.status_code == 200:
                        items = res.json().get("data", [])
                        if items and isinstance(items, list):
                            b_id = items[0].get("broadcaster_user_id")
                            if b_id:
                                return int(b_id)
            except Exception as e:
                logger.debug(f"Public v1 channel lookup error: {e}")

        # 2. Fallback to Kick v2 public API
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(
                    f"https://kick.com/api/v2/channels/{slug}",
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                if res.status_code == 200:
                    data = res.json()
                    b_id = data.get("user_id") or data.get("user", {}).get("id")
                    if b_id:
                        return int(b_id)
        except Exception as e:
            logger.debug(f"Kick v2 channel lookup error: {e}")

        return None

    async def subscribe_webhook(
        self,
        base_tunnel_url: str,
        channel_slug: str,
    ) -> Optional[str]:
        """Automatically register webhook subscription for chat.message.sent."""
        token = await self.get_app_token()
        if not token:
            logger.warning("Kick credentials not configured or token fetch failed; skipping automated subscription.")
            return None

        b_id = await self.get_broadcaster_id(channel_slug, token)
        webhook_endpoint = f"{base_tunnel_url.rstrip('/')}/api/liveclipper/webhooks/kick"
        payload: Dict[str, Any] = {
            "method": "webhook",
            "events": [
                {"name": "chat.message.sent", "version": 1}
            ],
            "url": webhook_endpoint,
        }
        if b_id:
            payload["broadcaster_user_id"] = b_id

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.post(
                    f"{KICK_API_BASE}/events/subscriptions",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )
                if res.status_code in (200, 201):
                    data = res.json()
                    # Extract subscription id (Kick uses "subscription_id")
                    sub_list = data.get("data", [])
                    if sub_list and isinstance(sub_list, list):
                        sub_id = sub_list[0].get("subscription_id") or sub_list[0].get("id") or "active"
                        logger.info(f"Successfully subscribed Kick webhook: ID={sub_id} -> {webhook_endpoint}")
                        return sub_id
                    return "active"
                else:
                    logger.warning(f"Kick webhook subscription returned {res.status_code}: {res.text}")
                    return None
            except Exception as e:
                logger.error(f"Kick webhook subscription failed: {e}")
                return None

    async def unsubscribe_webhook(self, subscription_id: str) -> bool:
        """Delete an active Kick webhook subscription."""
        if not subscription_id or subscription_id == "active":
            return True

        token = await self.get_app_token()
        if not token:
            return False

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.delete(
                    f"{KICK_API_BASE}/events/subscriptions/{subscription_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                return res.status_code in (200, 204)
            except Exception as e:
                logger.warning(f"Failed to unsubscribe Kick webhook {subscription_id}: {e}")
                return False


global_tunnel = TunnelManager()
global_kick_api = KickApiManager()
