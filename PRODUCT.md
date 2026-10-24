# vcobs

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Visitors read published notes and use shared text/file links. The administrator manages links, edits the Obsidian vault, uses the Codex chat and remote-desktop interface.

## Product Purpose

Provide browser access to published Obsidian content and the existing administrator tools without changing their functionality.

## Capabilities and Constraints

- Next.js application with existing public and server-protected administrator routes.
- Preserve existing page layouts, functions and theme choices; confirmed by the user on 2026-10-23.
- A visitor's selected theme is a browser-local preference shared by all application pages.
- The administrator controls which themes are offered to visitors.
- Themes style application chrome, not the contents of uploaded images or the remote Mac's framebuffer.
- New liquid-chrome theme is an additional option, not a replacement for Liquid Glass.

## Brand Commitments

The new theme follows the user's supplied liquid-metal reference: mirrored silver, deep black/blue reflections and calm readable content areas. The user explicitly requested GPU shaders and 3D rendering on 2026-10-23.

## Evidence on Hand

- Existing production components and theme registry in `components/`, `app/`, and `lib/themes.ts`.
- User-supplied Pinterest board screenshot in this conversation; the board itself redirects to Pinterest login.

## Product Principles

- One theme mechanism throughout the application.
- Keep document reading and administrative tasks usable under every theme.
- Preserve behavior and layout while expanding visual choices.
- Decorative rendering must have a usable fallback and must not intercept input.
