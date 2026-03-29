"""Reusable transactional HTML + plain-text email layout.

Layout follows common email-client constraints:

- Table-based structure (not CSS grid/flex) for Outlook and older clients
- Inline CSS only (no external stylesheets)
- Theming via :class:`EmailTheme` / ``EMAIL_THEME_*`` settings (colors, fonts, radii, shadows); no dark-mode hacks that break Gmail
- Optional logo via absolute HTTPS URL — prefer PNG ~120–240px wide; many clients block SVG
- ``inner_html`` must be built by trusted server code with :func:`html.escape` on user input

Use :class:`EmailBodyBuilder` for structured inner content (headings, images, tables, links,
in-body buttons, lists). Pipe its output into :class:`TransactionalEmailBuilder` via
:meth:`~TransactionalEmailBuilder.inner_html` / :meth:`~TransactionalEmailBuilder.plain_body`, or
:meth:`~TransactionalEmailBuilder.email_body` to set both at once from the same blocks.

Use :class:`TransactionalEmailBuilder` for the outer shell; :meth:`TransactionalEmailBuilder.build`
returns a :class:`TransactionalEmail` with ``html`` and ``plain`` for providers.

Below the card, a **compliance-style footer** (divider, optional address lines, “why you’re
receiving this”, optional unsubscribe link, optional social badges) is rendered from ``EMAIL_FOOTER_*``,
``EMAIL_UNSUBSCRIBE_URL``, and ``EMAIL_SOCIAL_*`` when set—see :func:`_compliance_footer_html`.
Omitted fields are left out of the footer (no automatic fallbacks).

References: `Campaign Monitor CSS support`_, `Litmus / Email on Acid` best practices.

.. _Campaign Monitor CSS support: https://www.campaignmonitor.com/css/
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Literal, Sequence

try:
    from typing import Self
except ImportError:  # Python < 3.11
    from typing_extensions import Self
from urllib.parse import urljoin

from app.config import settings
from app.email.unsubscribe import mailing_footer_unsubscribe_href

_DEFAULT_FONT_STACK = (
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
)


@dataclass(frozen=True)
class EmailTheme:
    """Visual tokens for HTML email (inline CSS). Defaults match the web app’s emerald palette.

    Override globally via Settings ``EMAIL_THEME_*`` env vars (non-empty values win), or pass an
    instance to :class:`EmailBodyBuilder` / :class:`TransactionalEmailBuilder` for one-off mail.
    """

    color_primary: str = "#059669"
    color_body: str = "#334155"
    color_muted: str = "#64748b"
    color_border: str = "#e2e8f0"
    color_card_bg: str = "#ffffff"
    color_page_bg: str = "#f1f5f9"
    color_heading: str = "#0f172a"
    color_button_text: str = "#ffffff"
    color_link: str = ""
    color_table_header_bg: str = ""
    font_stack: str = _DEFAULT_FONT_STACK
    font_size_body: str = "16px"
    font_size_small: str = "14px"
    font_size_caption: str = "13px"
    font_size_footer: str = "12px"
    font_size_h1: str = "22px"
    font_size_h2: str = "18px"
    font_size_h3: str = "16px"
    line_height_body: str = "1.6"
    radius_card: str = "12px"
    radius_button: str = "8px"
    shadow_card: str = "0 1px 2px rgba(15,23,42,0.06)"


def _theme_str(env_val: str, fallback: str) -> str:
    v = (env_val or "").strip()
    return v if v else fallback


def email_theme_from_settings() -> EmailTheme:
    """Resolve :class:`EmailTheme` from ``settings`` (cached defaults + ``EMAIL_THEME_*``)."""
    d = EmailTheme()
    s = settings
    return EmailTheme(
        color_primary=_theme_str(s.EMAIL_THEME_PRIMARY, d.color_primary),
        color_body=_theme_str(s.EMAIL_THEME_BODY, d.color_body),
        color_muted=_theme_str(s.EMAIL_THEME_MUTED, d.color_muted),
        color_border=_theme_str(s.EMAIL_THEME_BORDER, d.color_border),
        color_card_bg=_theme_str(s.EMAIL_THEME_CARD_BG, d.color_card_bg),
        color_page_bg=_theme_str(s.EMAIL_THEME_PAGE_BG, d.color_page_bg),
        color_heading=_theme_str(s.EMAIL_THEME_HEADING, d.color_heading),
        color_button_text=_theme_str(s.EMAIL_THEME_BUTTON_TEXT, d.color_button_text),
        color_link=_theme_str(s.EMAIL_THEME_LINK, d.color_link),
        color_table_header_bg=_theme_str(s.EMAIL_THEME_TABLE_HEADER_BG, d.color_table_header_bg),
        font_stack=_theme_str(s.EMAIL_THEME_FONT_STACK, d.font_stack),
        font_size_body=_theme_str(s.EMAIL_THEME_FONT_SIZE_BODY, d.font_size_body),
        font_size_small=_theme_str(s.EMAIL_THEME_FONT_SIZE_SMALL, d.font_size_small),
        font_size_caption=_theme_str(s.EMAIL_THEME_FONT_SIZE_CAPTION, d.font_size_caption),
        font_size_footer=_theme_str(s.EMAIL_THEME_FONT_SIZE_FOOTER, d.font_size_footer),
        font_size_h1=_theme_str(s.EMAIL_THEME_FONT_SIZE_H1, d.font_size_h1),
        font_size_h2=_theme_str(s.EMAIL_THEME_FONT_SIZE_H2, d.font_size_h2),
        font_size_h3=_theme_str(s.EMAIL_THEME_FONT_SIZE_H3, d.font_size_h3),
        line_height_body=_theme_str(s.EMAIL_THEME_LINE_HEIGHT_BODY, d.line_height_body),
        radius_card=_theme_str(s.EMAIL_THEME_RADIUS_CARD, d.radius_card),
        radius_button=_theme_str(s.EMAIL_THEME_RADIUS_BUTTON, d.radius_button),
        shadow_card=_theme_str(s.EMAIL_THEME_SHADOW_CARD, d.shadow_card),
    )


def _link_color(t: EmailTheme) -> str:
    return (t.color_link or "").strip() or t.color_primary


def _table_header_bg(t: EmailTheme) -> str:
    return (t.color_table_header_bg or "").strip() or t.color_page_bg


def esc(text: str) -> str:
    """Escape text for HTML body fragments."""
    return html.escape(text or "", quote=True)


def _default_footer_why_receiving() -> str:
    brand = (settings.APP_NAME or "Stemplitude").strip()
    return (
        f"You are receiving these emails because of activity related to your {brand} account "
        "or an invitation you received."
    )


def _social_footer_badges_html(theme: EmailTheme) -> str:
    """Monochrome circular badges (email-safe; no external icon CDN). Only URLs set in settings."""
    pairs: list[tuple[str, str, str]] = []
    if u := (settings.EMAIL_SOCIAL_WEBSITE_URL or "").strip():
        pairs.append((u, "Website", "Web"))
    if u := (settings.EMAIL_SOCIAL_INSTAGRAM_URL or "").strip():
        pairs.append((u, "Instagram", "IG"))
    if u := (settings.EMAIL_SOCIAL_LINKEDIN_URL or "").strip():
        pairs.append((u, "LinkedIn", "in"))
    if u := (settings.EMAIL_SOCIAL_X_URL or "").strip():
        pairs.append((u, "X", "X"))
    if u := (settings.EMAIL_SOCIAL_FACEBOOK_URL or "").strip():
        pairs.append((u, "Facebook", "f"))
    if u := (settings.EMAIL_SOCIAL_TIKTOK_URL or "").strip():
        pairs.append((u, "TikTok", "TT"))
    if u := (settings.EMAIL_SOCIAL_YOUTUBE_URL or "").strip():
        pairs.append((u, "YouTube", "YT"))
    if not pairs:
        return ""
    mu = theme.color_muted
    fs = theme.font_stack
    parts: list[str] = []
    for i, (url, aria, badge) in enumerate(pairs):
        margin = "margin-left:0;" if i == 0 else "margin-left:8px;"
        parts.append(
            f'<a href="{esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="{esc(aria)}" '
            f'style="display:inline-block;{margin}width:28px;height:28px;line-height:26px;'
            f"text-align:center;border-radius:50%;border:1px solid {mu};color:{mu};"
            f'text-decoration:none;font-size:10px;font-weight:700;font-family:{fs};'
            f'box-sizing:border-box;vertical-align:middle;">{esc(badge)}</a>'
        )
    return "".join(parts)


def _compliance_footer_html(theme: EmailTheme, link_color: str, *, compliance_route_key: str | None) -> str:
    """Address + why + unsubscribe (left), social badges (right), top rule."""
    th = theme
    lc = link_color
    fsf = th.font_size_footer
    fs = th.font_stack
    mu = th.color_muted
    bd = th.color_border

    addr = (settings.EMAIL_FOOTER_ADDRESS or "").strip()
    why = (settings.EMAIL_FOOTER_WHY_RECEIVING or "").strip() or _default_footer_why_receiving()
    unsub = mailing_footer_unsubscribe_href(compliance_route_key).strip()
    social = _social_footer_badges_html(th)

    addr_block = ""
    lines = [ln.strip() for ln in addr.splitlines() if ln.strip()]
    if lines:
        addr_html = "<br />".join(esc(ln) for ln in lines)
        addr_block = (
            f'<p style="margin:0 0 10px 0;font-size:{fsf};line-height:1.5;color:{mu};font-family:{fs};">'
            f"{addr_html}</p>"
        )

    why_block = (
        f'<p style="margin:0;font-size:{fsf};line-height:1.5;color:{mu};font-family:{fs};">{esc(why)}</p>'
    )

    unsub_block = ""
    if unsub:
        unsub_block = (
            f'<p style="margin:10px 0 0 0;font-size:{fsf};line-height:1.5;font-family:{fs};">'
            f'<a href="{esc(unsub)}" style="color:{lc};text-decoration:underline;">'
            f"Unsubscribe or manage email preferences</a></p>"
        )

    left_inner = f"{addr_block}{why_block}{unsub_block}"
    if social:
        inner = (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="mso-table-lspace:0pt;mso-table-rspace:0pt;">'
            f'<tr>'
            f'<td align="left" valign="top" style="padding:0;">{left_inner}</td>'
            f'<td align="right" valign="top" style="padding:0 0 0 16px;white-space:nowrap;">{social}</td>'
            f"</tr></table>"
        )
    else:
        inner = left_inner

    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="mso-table-lspace:0pt;mso-table-rspace:0pt;">'
        f'<tr><td style="border-top:1px solid {bd};padding:24px 0 0 0;">{inner}</td></tr></table>'
    )


def _compliance_footer_plain(*, compliance_route_key: str | None) -> tuple[str, ...]:
    """Lines for plain-text footer (after '—')."""
    out: list[str] = []
    addr = (settings.EMAIL_FOOTER_ADDRESS or "").strip()
    if addr:
        out.extend(addr.splitlines())
        out.append("")
    why = (settings.EMAIL_FOOTER_WHY_RECEIVING or "").strip() or _default_footer_why_receiving()
    out.append(why)
    if unsub := mailing_footer_unsubscribe_href(compliance_route_key).strip():
        out.append(f"Unsubscribe or manage preferences: {unsub}")
    social_lines: list[str] = []
    if site := (settings.EMAIL_SOCIAL_WEBSITE_URL or "").strip():
        social_lines.append(f"Website: {site}")
    labels = (
        ("Instagram", settings.EMAIL_SOCIAL_INSTAGRAM_URL),
        ("LinkedIn", settings.EMAIL_SOCIAL_LINKEDIN_URL),
        ("X", settings.EMAIL_SOCIAL_X_URL),
        ("Facebook", settings.EMAIL_SOCIAL_FACEBOOK_URL),
        ("TikTok", settings.EMAIL_SOCIAL_TIKTOK_URL),
        ("YouTube", settings.EMAIL_SOCIAL_YOUTUBE_URL),
    )
    for label, url in labels:
        if (u := (url or "").strip()):
            social_lines.append(f"{label}: {u}")
    if social_lines:
        out.append("")
        out.extend(social_lines)
    return tuple(out)


def app_absolute_url(path: str) -> str:
    """Build an absolute app URL from ``FRONTEND_URL`` and a path like ``/app/classrooms/…``."""
    base = settings.FRONTEND_URL.rstrip("/")
    p = path if path.startswith("/") else f"/{path}"
    return urljoin(f"{base}/", p.lstrip("/"))


def paragraphs_from_plain(*parts: str, theme: EmailTheme | None = None) -> str:
    """Turn plain-text paragraphs into styled ``<p>`` blocks (escaped)."""
    th = theme or email_theme_from_settings()
    chunks: list[str] = []
    for raw in parts:
        t = (raw or "").strip()
        if not t:
            continue
        chunks.append(
            f'<p style="margin:0 0 16px 0;font-size:{th.font_size_body};line-height:{th.line_height_body};'
            f"color:{th.color_body};font-family:{th.font_stack};\">{esc(t)}</p>"
        )
    return "".join(chunks)


class EmailBodyBuilder:
    """Compose inner email-safe HTML and a matching plain-text representation.

    All text arguments are HTML-escaped. URLs are escaped for attribute context. Use
    :meth:`raw_html` only for trusted server-generated fragments.

    Blocks use tables/inline styles where needed for Outlook and major webmail clients.

    Pass ``theme=`` to match a custom :class:`EmailTheme` used on :class:`TransactionalEmailBuilder`
    (otherwise :func:`email_theme_from_settings` is used).
    """

    __slots__ = ("_html", "_plain", "_theme")

    def __init__(self, theme: EmailTheme | None = None) -> None:
        self._html: list[str] = []
        self._plain: list[str] = []
        self._theme: EmailTheme | None = theme

    @property
    def _t(self) -> EmailTheme:
        return self._theme if self._theme is not None else email_theme_from_settings()

    def _p_html(self, margin_bottom: str, color: str, text: str, *, font_size: str | None = None) -> str:
        th = self._t
        fs = font_size or th.font_size_body
        return (
            f'<p style="margin:0 0 {margin_bottom} 0;font-size:{fs};line-height:{th.line_height_body};'
            f"color:{color};font-family:{th.font_stack};\">{esc(text)}</p>"
        )

    def h2(self, text: str) -> Self:
        """Section heading (below the card ``h1`` headline)."""
        th = self._t
        t = (text or "").strip()
        if t:
            self._html.append(
                f'<h2 style="margin:24px 0 12px 0;font-size:{th.font_size_h2};line-height:1.3;font-weight:700;'
                f"color:{th.color_heading};font-family:{th.font_stack};letter-spacing:-0.02em;\">"
                f"{esc(t)}</h2>"
            )
            self._plain.extend(["", t, ""])
        return self

    def h3(self, text: str) -> Self:
        """Subsection heading."""
        th = self._t
        t = (text or "").strip()
        if t:
            self._html.append(
                f'<h3 style="margin:20px 0 10px 0;font-size:{th.font_size_h3};line-height:1.35;font-weight:700;'
                f"color:{th.color_heading};font-family:{th.font_stack};\">{esc(t)}</h3>"
            )
            self._plain.extend(["", t, ""])
        return self

    def paragraph(self, text: str) -> Self:
        """Body paragraph."""
        t = (text or "").strip()
        if t:
            self._html.append(self._p_html("16px", self._t.color_body, t))
            self._plain.extend(["", t, ""])
        return self

    def paragraphs(self, *parts: str) -> Self:
        """Several plain paragraphs (skipped if empty after strip)."""
        for raw in parts:
            self.paragraph(raw)
        return self

    def muted(self, text: str) -> Self:
        """Smaller secondary copy (hints, disclaimers inside the body)."""
        t = (text or "").strip()
        if t:
            self._html.append(self._p_html("16px", self._t.color_muted, t, font_size=self._t.font_size_small))
            self._plain.extend(["", t, ""])
        return self

    def image(
        self,
        src: str,
        alt: str,
        *,
        width: int = 544,
        align: Literal["left", "center", "right"] = "center",
    ) -> Self:
        """Responsive image.

        ``src`` must be an absolute **HTTPS** URL that inbox clients can load without your cookies
        (e.g. public S3/R2 object URL, or better a CDN hostname in front of object storage). Presigned
        URLs work only until they expire, so they are a poor default for email.
        """
        s = (src or "").strip()
        if not s:
            return self
        a = (alt or "").strip() or " "
        al = "left" if align == "left" else "right" if align == "right" else "center"
        self._html.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:0 0 16px 0;"><tr><td align="{al}">'
            f'<img src="{esc(s)}" alt="{esc(a)}" width="{width}" '
            f'style="display:block;max-width:100%;height:auto;border:0;outline:none;'
            f'text-decoration:none;" />'
            f"</td></tr></table>"
        )
        self._plain.extend(["", f"[Image: {a}] {s}", ""])
        return self

    def caption(self, text: str) -> Self:
        """Caption below an image or table (muted)."""
        th = self._t
        t = (text or "").strip()
        if t:
            self._html.append(
                f'<p style="margin:-8px 0 16px 0;font-size:{th.font_size_caption};line-height:1.5;'
                f"color:{th.color_muted};font-family:{th.font_stack};text-align:center;\">{esc(t)}</p>"
            )
            self._plain.extend(["", t, ""])
        return self

    def link(self, url: str, label: str, *, new_tab: bool = True) -> Self:
        """Standalone line with a single text link."""
        th = self._t
        lc = _link_color(th)
        u, lab = (url or "").strip(), (label or "").strip()
        if not u or not lab:
            return self
        rel = ' rel="noopener noreferrer"' if new_tab else ""
        tgt = ' target="_blank"' if new_tab else ""
        self._html.append(
            f'<p style="margin:0 0 16px 0;font-size:{th.font_size_body};line-height:{th.line_height_body};'
            f"color:{th.color_body};font-family:{th.font_stack};\">"
            f'<a href="{esc(u)}" style="color:{lc};font-weight:600;text-decoration:underline;"'
            f"{tgt}{rel}>{esc(lab)}</a></p>"
        )
        self._plain.extend(["", f"{lab}: {u}", ""])
        return self

    def inline_links(self, *pairs: tuple[str, str], separator: str = " · ") -> Self:
        """One paragraph with multiple ``(url, label)`` links."""
        th = self._t
        lc = _link_color(th)
        cleaned: list[tuple[str, str]] = []
        for u, lab in pairs:
            uu, ll = (u or "").strip(), (lab or "").strip()
            if uu and ll:
                cleaned.append((uu, ll))
        if not cleaned:
            return self
        rel = ' rel="noopener noreferrer"'
        parts: list[str] = []
        for i, (uu, ll) in enumerate(cleaned):
            if i:
                parts.append(f'<span style="color:{th.color_muted};">{esc(separator)}</span>')
            parts.append(
                f'<a href="{esc(uu)}" style="color:{lc};font-weight:600;'
                f'text-decoration:underline;" target="_blank"{rel}>{esc(ll)}</a>'
            )
        self._html.append(
            f'<p style="margin:0 0 16px 0;font-size:15px;line-height:{th.line_height_body};color:{th.color_body};'
            f"font-family:{th.font_stack};\">{''.join(parts)}</p>"
        )
        self._plain.extend(["", *[f"{ll}: {uu}" for uu, ll in cleaned], ""])
        return self

    def button(
        self,
        url: str,
        label: str,
        *,
        variant: Literal["solid", "outline", "ghost"] = "outline",
    ) -> Self:
        """In-body button (separate from the template’s main :meth:`TransactionalEmailBuilder.primary_action`)."""
        th = self._t
        rb = th.radius_button
        u, lab = (url or "").strip(), (label or "").strip()
        if not u or not lab:
            return self
        if variant == "solid":
            td_style = f"border-radius:{rb};background:{th.color_primary};"
            a_style = (
                f"display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;"
                f"font-family:{th.font_stack};color:{th.color_button_text};text-decoration:none;border-radius:{rb};"
            )
        elif variant == "outline":
            td_style = f"border-radius:{rb};border:2px solid {th.color_primary};background:{th.color_card_bg};"
            a_style = (
                f"display:inline-block;padding:10px 20px;font-size:15px;font-weight:700;"
                f"font-family:{th.font_stack};color:{th.color_primary};text-decoration:none;border-radius:{rb};"
            )
        else:
            td_style = f"border-radius:{rb};background:transparent;"
            a_style = (
                f"display:inline-block;padding:8px 4px;font-size:15px;font-weight:600;"
                f"font-family:{th.font_stack};color:{th.color_primary};text-decoration:underline;"
            )
        self._html.append(
            f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:8px 0 16px 0;"><tr><td align="left" style="{td_style}">'
            f'<a href="{esc(u)}" target="_blank" rel="noopener noreferrer" style="{a_style}">{esc(lab)}</a>'
            f"</td></tr></table>"
        )
        self._plain.extend(["", f"{lab}: {u}", ""])
        return self

    def data_table(
        self,
        headers: Sequence[str],
        rows: Sequence[Sequence[str]],
        *,
        caption: str | None = None,
    ) -> Self:
        """Simple data grid (all cells escaped). Empty ``headers`` omits the header row."""
        heads_esc = [esc(str(h)) for h in headers]
        body_rows_esc: list[list[str]] = [[esc(str(c)) for c in row] for row in rows]
        if not heads_esc and not body_rows_esc:
            return self
        ncol = max([len(heads_esc)] + [len(r) for r in body_rows_esc], default=0)
        if ncol == 0:
            return self
        thm = self._t
        th_bg = _table_header_bg(thm)
        if caption and str(caption).strip():
            cap = esc(str(caption).strip())
            self._html.append(
                f'<p style="margin:0 0 8px 0;font-size:{thm.font_size_caption};font-weight:600;'
                f"color:{thm.color_heading};font-family:{thm.font_stack};\">{cap}</p>"
            )
            self._plain.extend(["", str(caption).strip(), ""])
        trs: list[str] = []
        if heads_esc:
            h_pad = list(heads_esc) + [""] * max(0, ncol - len(heads_esc))
            h_pad = h_pad[:ncol]
            th_cells = "".join(
                f'<th style="padding:10px 12px;border:1px solid {thm.color_border};text-align:left;'
                f"font-size:{thm.font_size_caption};font-weight:700;color:{thm.color_heading};"
                f"font-family:{thm.font_stack};background:{th_bg};\">{h}</th>"
                for h in h_pad
            )
            trs.append(f"<tr>{th_cells}</tr>")
        for row in body_rows_esc:
            r = list(row) + [""] * max(0, ncol - len(row))
            r = r[:ncol] if ncol else row
            tds = "".join(
                f'<td style="padding:10px 12px;border:1px solid {thm.color_border};text-align:left;'
                f"font-size:{thm.font_size_small};color:{thm.color_body};font-family:{thm.font_stack};"
                f'vertical-align:top;">{c}</td>'
                for c in r
            )
            trs.append(f"<tr>{tds}</tr>")
        if not trs:
            return self
        self._html.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="border-collapse:collapse;margin:0 0 20px 0;border:1px solid {thm.color_border};'
            f'mso-table-lspace:0pt;mso-table-rspace:0pt;">{"".join(trs)}</table>'
        )
        # Plain: TSV-style
        plain_lines: list[str] = []
        if list(headers):
            plain_lines.append("\t".join(str(h) for h in headers))
        for row in rows:
            plain_lines.append("\t".join(str(c) for c in row))
        self._plain.extend(["", *plain_lines, ""])
        return self

    def key_value_rows(self, pairs: Sequence[tuple[str, str]]) -> Self:
        """Two-column fact table (label | value)."""
        if not pairs:
            return self
        thm = self._t
        trs: list[str] = []
        plain_lines: list[str] = []
        for k, v in pairs:
            kk, vv = esc(str(k)), esc(str(v))
            trs.append(
                f'<tr><td style="padding:8px 12px;border:1px solid {thm.color_border};'
                f"font-size:{thm.font_size_small};font-weight:600;color:{thm.color_muted};"
                f"font-family:{thm.font_stack};width:36%;vertical-align:top;\">{kk}</td>"
                f'<td style="padding:8px 12px;border:1px solid {thm.color_border};'
                f"font-size:{thm.font_size_small};color:{thm.color_body};font-family:{thm.font_stack};"
                f'vertical-align:top;\">{vv}</td></tr>'
            )
            plain_lines.append(f"{k}: {v}")
        self._html.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="border-collapse:collapse;margin:0 0 20px 0;border:1px solid {thm.color_border};'
            f'mso-table-lspace:0pt;mso-table-rspace:0pt;">{"".join(trs)}</table>'
        )
        self._plain.extend(["", *plain_lines, ""])
        return self

    def bullet_list(self, items: Sequence[str]) -> Self:
        """Bullet list using a table (better than ``<ul>`` in some clients)."""
        thm = self._t
        rows: list[str] = []
        for it in items:
            t = (it or "").strip()
            if not t:
                continue
            rows.append(
                f'<tr><td style="padding:4px 0;font-size:15px;line-height:1.55;color:{thm.color_body};'
                f"font-family:{thm.font_stack};vertical-align:top;width:20px;\">&#8226;</td>"
                f'<td style="padding:4px 0 4px 8px;font-size:15px;line-height:1.55;color:{thm.color_body};'
                f"font-family:{thm.font_stack};vertical-align:top;\">{esc(t)}</td></tr>"
            )
        if not rows:
            return self
        self._html.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:0 0 16px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">'
            f'{"".join(rows)}</table>'
        )
        self._plain.extend(["", *[f"* {((it or '').strip())}" for it in items if (it or "").strip()], ""])
        return self

    def numbered_list(self, items: Sequence[str]) -> Self:
        """Numbered list using a table."""
        thm = self._t
        n = 0
        rows: list[str] = []
        plain_items: list[str] = []
        for it in items:
            t = (it or "").strip()
            if not t:
                continue
            n += 1
            rows.append(
                f'<tr><td style="padding:4px 0;font-size:15px;line-height:1.55;color:{thm.color_body};'
                f"font-family:{thm.font_stack};vertical-align:top;width:28px;font-weight:600;\">{n}.</td>"
                f'<td style="padding:4px 0 4px 4px;font-size:15px;line-height:1.55;color:{thm.color_body};'
                f"font-family:{thm.font_stack};vertical-align:top;\">{esc(t)}</td></tr>"
            )
            plain_items.append(f"{n}. {t}")
        if not rows:
            return self
        self._html.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:0 0 16px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">'
            f'{"".join(rows)}</table>'
        )
        self._plain.extend(["", *plain_items, ""])
        return self

    def divider(self) -> Self:
        """Horizontal rule between sections."""
        thm = self._t
        self._html.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:20px 0;"><tr><td style="border-top:1px solid {thm.color_border};'
            f'font-size:1px;line-height:1px;">&nbsp;</td></tr></table>'
        )
        self._plain.append("")
        return self

    def spacer(self, height_px: int = 16) -> Self:
        """Vertical whitespace."""
        h = max(4, min(height_px, 48))
        self._html.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            f'<tr><td style="font-size:1px;line-height:1px;height:{h}px;">&nbsp;</td></tr></table>'
        )
        return self

    def otp_code(self, code: str) -> Self:
        """Monospace one-time code block (OTP). Non-alphanumeric characters are stripped for display."""
        raw = "".join(c for c in (code or "") if c.isalnum() or c.isspace()).strip()
        raw = " ".join(raw.split())[:64]
        if not raw:
            return self
        display = raw.upper() if raw.isalnum() and len(raw) <= 12 else raw
        thm = self._t
        self._html.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:0 0 20px 0;"><tr><td align="center" style="padding:20px 16px;'
            f"background:{thm.color_page_bg};border:1px dashed {thm.color_border};"
            f'border-radius:{thm.radius_button};">'
            f'<p style="margin:0;font-size:28px;font-weight:700;letter-spacing:0.25em;'
            f"color:{thm.color_heading};font-family:'SF Mono',Consolas,'Liberation Mono',Menlo,monospace;\">"
            f"{esc(display)}</p>"
            f"</td></tr></table>"
        )
        self._plain.extend(["", f"Code: {display}", ""])
        return self

    def security_callout(self, text: str) -> Self:
        """Muted security note with a primary-colored left accent (phishing warnings, expiry, etc.)."""
        t = (text or "").strip()
        if not t:
            return self
        thm = self._t
        self._html.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:0 0 16px 0;border-left:4px solid {thm.color_primary};'
            f"background:{thm.color_page_bg};border-radius:0 {thm.radius_button} {thm.radius_button} 0;\">"
            f'<tr><td style="padding:12px 14px;font-size:{thm.font_size_small};line-height:1.55;'
            f"color:{thm.color_muted};font-family:{thm.font_stack};\">{esc(t)}</td></tr></table>"
        )
        self._plain.extend(["", t, ""])
        return self

    def raw_html(self, fragment: str) -> Self:
        """Append trusted HTML (no escaping). Do not pass user-controlled strings."""
        if fragment:
            self._html.append(fragment)
        return self

    def raw_plain(self, text: str) -> Self:
        """Append plain text as-is (e.g. preformatted lines you already control)."""
        if text:
            self._plain.append(text)
        return self

    def build_html(self) -> str:
        """Concatenated inner HTML for :meth:`TransactionalEmailBuilder.inner_html`."""
        return "".join(self._html)

    def build_plain(self) -> str:
        """Plain-text mirror of blocks; trim extra blank lines."""
        raw = "\n".join(self._plain)
        lines = [ln.rstrip() for ln in raw.splitlines()]
        out: list[str] = []
        prev_empty = True
        for ln in lines:
            empty = not ln.strip()
            if empty and prev_empty:
                continue
            out.append(ln)
            prev_empty = empty
        return "\n".join(out).strip()


def _clip_preheader(text: str, max_len: int = 120) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rstrip() + "…"


@dataclass(frozen=True)
class TransactionalEmail:
    """Final MIME-friendly parts from :class:`TransactionalEmailBuilder`."""

    html: str
    plain: str
    # RFC 8058 HTTPS URL for List-Unsubscribe (set in outbox after per-recipient placeholder swap).
    list_unsubscribe_one_click_url: str | None = None


class TransactionalEmailBuilder:
    """Fluent builder for branded transactional email (HTML + plain text).

    Typical flow::

        msg = (
            TransactionalEmailBuilder()
            .headline(subject)
            .preheader(preview_line)
            .inner_html(paragraphs_from_plain(body))
            .plain_body(body)
            .primary_action(url, "Open")
            .footer_category("Class enrollment")
            .build()
        )
        send_email_task.delay(to, subject, msg.plain, msg.html, ...)
    """

    __slots__ = (
        "_headline",
        "_preheader",
        "_inner_html",
        "_plain_body",
        "_primary",
        "_alternate_link_url",
        "_footnote_html",
        "_footnote_plain",
        "_footer_category",
        "_compliance_route_key",
        "_theme",
    )

    def __init__(self, theme: EmailTheme | None = None) -> None:
        self._headline: str = ""
        self._preheader: str | None = None
        self._inner_html: str = ""
        self._plain_body: str = ""
        self._primary: tuple[str, str] | None = None
        self._alternate_link_url: str | None = None
        self._footnote_html: str | None = None
        self._footnote_plain: str | None = None
        self._footer_category: str | None = None
        self._compliance_route_key: str | None = None
        self._theme: EmailTheme | None = theme

    def theme(self, value: EmailTheme | None) -> Self:
        """Palette, typography, and radii for the outer shell (and match via :class:`EmailBodyBuilder`(..., theme=…))."""
        self._theme = value
        return self

    def headline(self, value: str) -> Self:
        """Main title inside the card (often matches the email subject)."""
        self._headline = value or ""
        return self

    def preheader(self, value: str | None) -> Self:
        """Inbox preview line; defaults to headline when omitted at build time."""
        self._preheader = value
        return self

    def inner_html(self, fragment: str) -> Self:
        """Trusted HTML body (escape user input with :func:`esc`)."""
        self._inner_html = fragment or ""
        return self

    def email_body(self, builder: EmailBodyBuilder) -> Self:
        """Set inner HTML and :meth:`plain_body` from one :class:`EmailBodyBuilder`."""
        self._inner_html = builder.build_html()
        self._plain_body = builder.build_plain()
        return self

    def plain_body(self, text: str) -> Self:
        """Main narrative for the plain-text version (below the headline)."""
        self._plain_body = text or ""
        return self

    def primary_action(self, url: str, label: str) -> Self:
        """Primary button target and label."""
        self._primary = (url, label)
        return self

    def alternate_link(self, url: str | None) -> Self:
        """Full URL shown under the button when the button may not work."""
        self._alternate_link_url = url
        return self

    def mirror_primary_as_text_link(self) -> Self:
        """Reuse the primary action URL as the “copy this link” fallback."""
        if self._primary:
            self._alternate_link_url = self._primary[0]
        return self

    def footnote_html(self, fragment: str | None) -> Self:
        """Trusted HTML below the CTA (small, muted)."""
        self._footnote_html = fragment
        return self

    def footnote_plain(self, text: str | None) -> Self:
        """Plain footnote before the standard footer."""
        self._footnote_plain = text
        return self

    def footer_category(self, label: str | None) -> Self:
        """Short line in the footer (e.g. “Invitation”)."""
        self._footer_category = label
        return self

    def compliance_route_key(self, route_key: str | None) -> Self:
        """Routing slug for footer unsubscribe + suppression class (see :mod:`app.email.unsubscribe`)."""
        self._compliance_route_key = (route_key or "").strip() or None
        return self

    def build(self) -> TransactionalEmail:
        if not self._headline.strip():
            raise ValueError("TransactionalEmailBuilder: headline is required")
        html_out = self._assemble_html()
        plain_out = self._assemble_plain()
        return TransactionalEmail(html=html_out, plain=plain_out)

    def _assemble_html(self) -> str:
        th = self._theme if self._theme is not None else email_theme_from_settings()
        lc = _link_color(th)
        headline = self._headline.strip()
        inner_html = self._inner_html
        preheader = self._preheader
        primary_action = self._primary
        alternate_link_url = self._alternate_link_url
        footnote_html = self._footnote_html
        footer_category = self._footer_category
        compliance_route_key = self._compliance_route_key

        brand = esc(settings.APP_NAME)
        logo_url = (settings.EMAIL_BRAND_LOGO_URL or "").strip()
        ph = _clip_preheader(preheader or headline)

        pre_block = (
            f'<div style="display:none;font-size:1px;color:{th.color_page_bg};line-height:1px;'
            f'max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{esc(ph)}</div>'
            f'<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">'
            f"&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>"
        )

        if logo_url:
            logo_block = (
                f'<img src="{esc(logo_url)}" alt="{brand}" width="132" height="auto" '
                f'style="display:block;max-width:132px;height:auto;border:0;outline:none;'
                f'text-decoration:none;margin:0 auto 8px auto;" />'
            )
        else:
            logo_block = (
                f'<p style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em;'
                f"color:{th.color_heading};font-family:{th.font_stack};\">{brand}</p>"
            )

        cta_block = ""
        if primary_action:
            url, label = primary_action
            url_s = esc(url)
            label_s = esc(label)
            rb = th.radius_button
            cta_block = (
                f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
                f'style="margin:28px auto 20px auto;">'
                f"<tr><td align=\"center\" style=\"border-radius:{rb};background:{th.color_primary};\">"
                f'<a href="{url_s}" target="_blank" rel="noopener noreferrer" '
                f'style="display:inline-block;padding:14px 28px;font-size:{th.font_size_body};font-weight:700;'
                f"font-family:{th.font_stack};color:{th.color_button_text};text-decoration:none;"
                f'border-radius:{rb};mso-padding-alt:0;">'
                f'<span style="mso-text-raise:16pt;">{label_s}</span></a>'
                f"</td></tr></table>"
            )

        alt_link_block = ""
        if alternate_link_url:
            alt_link_block = (
                f'<p style="margin:0 0 8px 0;font-size:{th.font_size_caption};line-height:1.5;'
                f"color:{th.color_muted};font-family:{th.font_stack};\">"
                f"If the button does not work, copy and paste this link into your browser:"
                f"</p>"
                f'<p style="margin:0 0 24px 0;font-size:{th.font_size_caption};line-height:1.5;word-break:break-all;'
                f"color:{th.color_muted};font-family:{th.font_stack};\">{esc(alternate_link_url)}</p>"
            )

        foot_html = ""
        if footnote_html:
            foot_html = (
                f'<p style="margin:16px 0 0 0;font-size:{th.font_size_caption};line-height:1.5;'
                f"color:{th.color_muted};font-family:{th.font_stack};\">{footnote_html}</p>"
            )

        cat_line = ""
        if footer_category and footer_category.strip():
            cat_line = (
                f'<p style="margin:8px 0 0 0;text-align:center;font-size:{th.font_size_footer};line-height:1.5;'
                f"color:{th.color_muted};font-family:{th.font_stack};\">{esc(footer_category.strip())}</p>"
            )

        app_link = esc(settings.FRONTEND_URL.rstrip("/"))
        rc = th.radius_card
        compliance_footer = _compliance_footer_html(th, lc, compliance_route_key=compliance_route_key)

        return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>{esc(headline)}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:{th.color_page_bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
{pre_block}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:{th.color_page_bg};mso-table-lspace:0pt;mso-table-rspace:0pt;">
<tr>
<td align="center" style="padding:32px 16px 48px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
<tr>
<td style="padding:0 0 24px 0;text-align:center;">{logo_block}</td>
</tr>
<tr>
<td style="background:{th.color_card_bg};border:1px solid {th.color_border};border-radius:{rc};padding:32px 28px 28px 28px;box-shadow:{th.shadow_card};">
<h1 style="margin:0 0 20px 0;font-size:{th.font_size_h1};line-height:1.25;font-weight:700;color:{th.color_heading};font-family:{th.font_stack};letter-spacing:-0.02em;">{esc(headline)}</h1>
<div style="font-family:{th.font_stack};font-size:{th.font_size_body};line-height:{th.line_height_body};color:{th.color_body};">
{inner_html}
</div>
{cta_block}
{alt_link_block}
{foot_html}
</td>
</tr>
<tr>
<td style="padding:16px 8px 0 8px;">
{compliance_footer}
<p style="margin:20px 0 0 0;text-align:center;font-size:{th.font_size_footer};line-height:{th.line_height_body};color:{th.color_muted};font-family:{th.font_stack};">
<a href="{app_link}" style="color:{lc};text-decoration:underline;">{app_link}</a>
</p>
{cat_line}
<p style="margin:16px 0 0 0;text-align:center;font-size:{th.font_size_caption};line-height:1.5;color:{th.color_muted};font-family:{th.font_stack};">
© {brand}
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>"""

    def _assemble_plain(self) -> str:
        headline = self._headline.strip()
        body = self._plain_body.strip()
        action_url = self._primary[0] if self._primary else None
        action_label = self._primary[1] if self._primary else None
        footnote = self._footnote_plain
        footer_category = self._footer_category
        compliance_route_key = self._compliance_route_key

        lines: list[str] = [headline, "", body]
        if action_url and action_url.strip():
            label = (action_label or "Open link").strip()
            lines.extend(["", f"{label}: {action_url.strip()}"])
        if footnote and footnote.strip():
            lines.extend(["", footnote.strip()])
        lines.append("")
        lines.append("—")
        lines.extend(_compliance_footer_plain(compliance_route_key=compliance_route_key))
        lines.extend(
            [
                "",
                settings.APP_NAME,
                settings.FRONTEND_URL.rstrip("/"),
            ]
        )
        if footer_category and footer_category.strip():
            lines.append(f"Email type: {footer_category.strip()}")
        return "\n".join(lines)
