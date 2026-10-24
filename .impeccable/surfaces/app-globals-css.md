---
version: 1
slug: "app-globals-css"
primary_target: "app/globals.css"
related_targets: ["app/liquid-chrome.css","components/component-library.tsx"]
---

# Liquid Chrome — approved direction

## Direction contract

THESIS: Liquid chrome, not frosted translucent rectangles. Application tasks remain the foreground.

OWN-WORLD: Silver reflective controls, blue-black surfaces, narrow white studio reflections and cool pearl text. A real deformed 3D ribbon carries the reference material.

STORY: Visitors choose an appearance once, read or edit their documents, and retain that choice across the existing site. Administrators keep control over offered themes.

FIRST VIEWPORT: Preserve existing navigation, page heading, controls and content positions. Concentrate reflective geometry at the edges/preview negative space; quiet solid reading surfaces protect the centre.

FORM: User-pinned extension of the existing interface, confirmed from supplied reference. No replacement composition or random direction seed. Implement the requested GPU material directly in code rather than replacing it with an image comp.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

User confirmation: 2026-10-23, silver liquid chrome with black/blue reflections; calm readable content; explicit request to use GPU shaders and 3D models. Existing theme choices and all page layouts/functions remain unchanged.

This is a new variant in an established interface, not a new page composition or replacement identity. Build the actual rendering technique directly in code. Existing `/admin/components` is the preview; do not create additional galleries or fictional content.

## First viewport / cross-surface reach

A blue-black application canvas, silver reflective controls and cool pearl text. Realistic 3D chrome is concentrated around the edges and negative space; it must never reduce the legibility of notes, editor text, chat or administrative data. The liquid material has broad dark reflection bands cut by narrow bright highlights, rather than cloudy translucent panels. Borders show a precise metallic lip; inputs are recessed and readable. All real application pages inherit this theme from the same registry/provider.

## Signature interaction and rendering

One bounded WebGL canvas, loaded only when Liquid Chrome is active, renders a procedurally deformed 3D chrome surface with analytic environment reflections, Fresnel and specular lighting. Gentle pointer response changes reflections. Use real vertex/fragment shader geometry, not a screenshot or CSS-only imitation. No external model/network dependencies, no requests for user data.

Cap rendering resolution and frame rate; stop rendering in hidden tabs; reduced motion gets a static rendering; switching away fully releases GPU resources. A WebGL/context-loss fallback retains the same readable silver/blue-black CSS theme. GPU rendering is decorative and pointer-transparent. Never filter or recolor uploaded images, remote display pixels or scene objects.

## Review

Check static and interactive `/admin/components`, home, notes, pasted text/files, login/admin hub, themes/links, chat, vault editor and remote shell. Desktop and mobile, focus/error/disabled states, reduced motion and forced WebGL unavailability. Verify meaningful dark/bright bands on the 3D surface, no animated glare over text, no horizontal overflow, no GPU canvas outside this theme. User must approve the visual preview before final integration/release.
