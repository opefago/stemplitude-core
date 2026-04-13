"""YouTube integration provider (Google OAuth + YouTube Data API)."""

from __future__ import annotations

from datetime import datetime
from urllib.parse import urlencode

import httpx

from .base import BaseIntegrationProvider, CalendarEvent


class YouTubeProvider(BaseIntegrationProvider):
    provider_name = "youtube"

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
        self.token_url = "https://oauth2.googleapis.com/token"
        self.youtube_api_base = "https://www.googleapis.com/youtube/v3"

    def get_authorization_url(self, state: str, redirect_uri: str, scopes: list[str]) -> str:
        scope_str = " ".join(scopes)
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": scope_str,
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
        }
        return f"{self.auth_url}?{urlencode(params)}"

    async def exchange_code(self, code: str, redirect_uri: str) -> tuple[str, str | None, int | None]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                self.token_url,
                data={
                    "code": code,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            data = response.json()
        return data["access_token"], data.get("refresh_token"), data.get("expires_in")

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, int | None]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                self.token_url,
                data={
                    "refresh_token": refresh_token,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "refresh_token",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            data = response.json()
        return data["access_token"], data.get("expires_in")

    async def list_videos(
        self,
        access_token: str,
        *,
        source: str,
        query: str | None = None,
        page_token: str | None = None,
        max_results: int = 12,
    ) -> dict:
        headers = {"Authorization": f"Bearer {access_token}"}
        params: dict[str, str | int] = {
            "part": "snippet",
            "type": "video",
            "maxResults": max(1, min(max_results, 25)),
            "order": "date",
        }
        if page_token:
            params["pageToken"] = page_token
        if query:
            params["q"] = query
        if source == "mine":
            params["forMine"] = "true"

        async with httpx.AsyncClient(timeout=20) as client:
            search_res = await client.get(
                f"{self.youtube_api_base}/search",
                params=params,
                headers=headers,
            )
            search_res.raise_for_status()
            search_data = search_res.json()

            ids = [
                item.get("id", {}).get("videoId")
                for item in search_data.get("items", [])
                if item.get("id", {}).get("videoId")
            ]
            details_by_id: dict[str, dict] = {}
            if ids:
                details_res = await client.get(
                    f"{self.youtube_api_base}/videos",
                    params={
                        "part": "contentDetails,status,snippet",
                        "id": ",".join(ids),
                        "maxResults": len(ids),
                    },
                    headers=headers,
                )
                details_res.raise_for_status()
                details_data = details_res.json()
                for row in details_data.get("items", []):
                    details_by_id[row.get("id")] = row

        videos = []
        for item in search_data.get("items", []):
            video_id = item.get("id", {}).get("videoId")
            if not video_id:
                continue
            snippet = item.get("snippet", {}) or {}
            details = details_by_id.get(video_id, {})
            details_status = details.get("status", {}) or {}
            details_content = details.get("contentDetails", {}) or {}
            videos.append(
                {
                    "id": video_id,
                    "title": snippet.get("title"),
                    "description": snippet.get("description"),
                    "thumbnail_url": (
                        (snippet.get("thumbnails", {}).get("medium") or {}).get("url")
                        or (snippet.get("thumbnails", {}).get("default") or {}).get("url")
                    ),
                    "published_at": snippet.get("publishedAt"),
                    "privacy_status": details_status.get("privacyStatus"),
                    "duration": details_content.get("duration"),
                }
            )

        return {
            "items": videos,
            "next_page_token": search_data.get("nextPageToken"),
            "prev_page_token": search_data.get("prevPageToken"),
        }

    async def create_meeting(
        self,
        access_token: str,
        *,
        title: str,
        start: datetime,
        end: datetime,
        description: str | None = None,
    ) -> dict:
        return {"id": "", "join_url": ""}

    async def delete_meeting(self, access_token: str, meeting_id: str) -> bool:
        return False

    async def sync_calendar(
        self,
        access_token: str,
        calendar_id: str | None = None,
        *,
        start: datetime,
        end: datetime,
    ) -> list[CalendarEvent]:
        return []
