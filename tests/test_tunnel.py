"""Tests for automated Cloudflare tunnel and Kick webhook subscription manager."""
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from live_clipper.tunnel import TunnelManager, KickApiManager


class TestTunnelAndKickApi(unittest.IsolatedAsyncioTestCase):
    """Test automated tunnel lifecycle and Kick API calls."""

    def test_tunnel_manager_env_override(self):
        """KICK_WEBHOOK_URL in environment overrides automatic tunnel."""
        mgr = TunnelManager(default_port=8000)
        with patch.dict(os.environ, {"KICK_WEBHOOK_URL": "https://my-custom-domain.com"}):
            url = mgr.start_tunnel()
            self.assertEqual(url, "https://my-custom-domain.com")
            self.assertEqual(mgr.tunnel_url, "https://my-custom-domain.com")

    def test_kick_api_is_configured(self):
        """is_configured is True only when both KICK_CLIENT_ID and KICK_CLIENT_SECRET are set."""
        api = KickApiManager()
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(api.is_configured)

        with patch.dict(os.environ, {"KICK_CLIENT_ID": "cid", "KICK_CLIENT_SECRET": "sec"}):
            self.assertTrue(api.is_configured)

    async def test_kick_api_token_fetch(self):
        """KickApiManager requests OAuth token using client_credentials grant."""
        api = KickApiManager()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"access_token": "test_token_123", "expires_in": 7200}

        with patch.dict(os.environ, {"KICK_CLIENT_ID": "client_abc", "KICK_CLIENT_SECRET": "secret_xyz"}):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
                token = await api.get_app_token()
                self.assertEqual(token, "test_token_123")

    async def test_kick_api_subscribe_webhook(self):
        """KickApiManager subscribes webhook to Kick events endpoint."""
        api = KickApiManager()
        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {"access_token": "test_token_123"}

        mock_sub_resp = MagicMock()
        mock_sub_resp.status_code = 201
        mock_sub_resp.json.return_value = {
            "data": [{"id": "sub_987", "event": "chat.message.sent"}]
        }

        with patch.dict(os.environ, {"KICK_CLIENT_ID": "client_abc", "KICK_CLIENT_SECRET": "secret_xyz"}):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=[mock_token_resp, mock_sub_resp]):
                sub_id = await api.subscribe_webhook("https://tunnel.trycloudflare.com", "streamer")
                self.assertEqual(sub_id, "sub_987")

    async def test_kick_api_unsubscribe_webhook(self):
        """KickApiManager deletes webhook subscription on stop."""
        api = KickApiManager()
        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {"access_token": "test_token_123"}

        mock_del_resp = MagicMock()
        mock_del_resp.status_code = 204

        with patch.dict(os.environ, {"KICK_CLIENT_ID": "client_abc", "KICK_CLIENT_SECRET": "secret_xyz"}):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp):
                with patch("httpx.AsyncClient.delete", new_callable=AsyncMock, return_value=mock_del_resp):
                    ok = await api.unsubscribe_webhook("sub_987")
                    self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
