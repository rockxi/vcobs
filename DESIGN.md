---
name: vcobs
description: Existing theme worlds on shared document and administrator surfaces.
colors:
  accent: "#b66cff"
  lime: "#c4a7ff"
  ink: "#e8e6ee"
  muted: "#9895a3"
  paper: "#12131a"
  surface: "#16171f"
  surface-raised: "#1b1c25"
  line: "#292a34"
  chrome-accent: "#bbd6ff"
  chrome-lime: "#e0eaff"
  chrome-ink: "#eaf0f7"
  chrome-muted: "#a8b6c8"
  chrome-paper: "#0a101b"
  chrome-surface: "#101a29"
  chrome-surface-raised: "#1a293d"
  chrome-line: "#35455b"
typography:
  display:
    fontFamily: 'Georgia, "Times New Roman", serif'
    fontSize: "clamp(32px,5vw,52px)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-.04em"
  title:
    fontFamily: "Inter, ui-sans-serif, sans-serif"
    fontSize: "clamp(29px,3.2vw,40px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-.035em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: "16px"
    lineHeight: 1.62
  label:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
    fontSize: "11px"
rounded:
  square: "0"
  tree-row: "5px"
  glass-control: "14px"
  chrome-control: "12px"
spacing:
  control-block: "8px"
  control-inline: "13px"
  grid-gap: "12px"
  public-grid-gap: "16px"
components:
  button-primary:
    textColor: "var(--on-action)"
    padding: "8px 13px"
  input:
    backgroundColor: "var(--input-bg)"
    textColor: "var(--ink)"
    padding: "9px 11px"
  navigation:
    textColor: "var(--link-fg)"
  status:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.muted}"
    padding: "5px 8px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "18px"
---

# Design System: vcobs

## Overview

vcobs keeps document reading and administrator tasks in the foreground. Existing page structures and theme choices remain intact. Obsidianite is the default; the theme registry defines six additional choices rather than one replacement identity.

The shared system uses restrained task surfaces, explicit text hierarchy and consistent semantic roles. The optional Liquid Chrome theme adds mirrored silver and black/blue reflections around calm content areas. The user approved the visual candidate and requested production publication on 2026-10-24.

**Key Characteristics:**

- Shared layout and behavior across theme choices.
- Theme-aware text, surfaces, controls and status colors.
- Solid reading and editing surfaces with decorative material at the edges.

## Colors

The frontmatter records Obsidianite's eight base colors and the additional Chrome palette. The `chrome-` prefix identifies documentation entries; runtime properties keep their unprefixed names. Other variant values remain authoritative in `lib/themes.ts`.

### Primary

`accent` identifies links, focus and active controls; `lime` is the historical name for the lighter or contrasting accent, not a promise of green. Chrome uses cool silver-blue accents.

### Neutral

`ink` and `muted` distinguish primary and secondary text. `paper`, `surface` and `surface-raised` establish content and container layers; `line` divides them. Chrome uses pearl text over blue-black layers.

| Registry ID | Existing character |
| --- | --- |
| `obsidianite` | Default dark violet; cyan heading and pink heading-rule roles |
| `violet-night` | Deeper violet contrast |
| `lavender-ink` | Softer lavender on dark surfaces |
| `neon-grid` | Cyan and magenta with grid/HUD treatments |
| `frutiger-aero` | Light sky/water surfaces and green accents |
| `liquid-glass` | Dark glass, soft color fields and rounded controls |
| `liquid-chrome` | Optional silver metal and black/blue reflections; approved for publication |

**The Single Registry Rule.** Define theme identities, base tokens and role overrides in `lib/themes.ts`; consume generated CSS properties throughout the application.

Semantic roles include `--document-bg`, `--input-bg`, `--code-fg`, `--heading-fg`, `--control-gradient`, `--control-foreground`, `--on-action`, `--focus-ring` and success/error/warning foreground, background and border roles. Use the appropriate role rather than copying a theme's literal color. Gradients and material shadows are extension data, not flat color tokens.

## Typography

The global UI family is the system stack exposed as `--ui-font`. Notes use the body rhythm in the frontmatter; note mastheads and prose headings explicitly use Inter with sans-serif fallbacks. Public/library display headings retain Georgia. Metadata and code use system monospace stacks.

The display and title entries describe distinct existing contexts; they are not interchangeable tiers for every screen. Material preview overrides exist for Neon Grid, Frutiger Aero and Liquid Glass. Preserve those contexts.

**The Reading Hierarchy Rule.** Preserve readable body text and the existing heading hierarchy when adding a theme; material effects must not become a text treatment.

## Layout

The public reader uses a sidebar (308px) and flexible document column. At the existing mobile breakpoint (720px), it becomes a single column; sidebar collapse behavior remains available. The administrator vault has its own sidebar (280px) and mobile breakpoint (760px). Do not unify these independent layouts incidentally.

The public library caps its container at (1120px); the component library at (1200px). Public note cards form three columns before the mobile stack. Administrator records use two columns before their mobile stack (620px). Shared gaps include (12px) and (16px), while document padding remains fluid. No new universal spacing scale is implied.

## Elevation & Depth

Default reading surfaces rely on tonal separation and borders; `--shadow` defaults to `none`. Menus, editor workspaces and selected controls have their own shadows. Glass adds localized blur and reflective highlights. Chrome uses metallic control gradients and a separate decorative GPU scene, while inputs, prose and editor surfaces remain solid.

Chrome's lazy-loaded WebGL1 renderer draws a procedural deformed torus-knot mesh in two edge placements using vertex and fragment shaders, analytic studio reflections and a Fresnel term. A single pointer-transparent, accessibility-hidden canvas sits behind the application. There are no external textures, models or raster assets in this renderer.

Configured rendering limits are (24 frames/second), (800,000 pixels) and device-pixel-ratio (1.5); these are policy limits, not measured GPU utilization. Hidden tabs pause rendering. Reduced motion draws a static scene. WebGL failure or context loss retains the CSS fallback; reselecting the theme retries the scene. Unmount removes listeners and releases GPU resources, with context release deferred one task to allow React StrictMode replay. Forced colors hides the backdrop.

**The Content Surface Rule.** Keep decorative reflections behind content and outside the image, remote-framebuffer and drawing data themselves.

## Shapes

The default chrome is predominantly square, with deliberate exceptions such as tree rows (5px) and local navigation controls. Radius is context-specific rather than globally uniform. `--control-radius` supplies material overrides: Liquid Glass (14px), Liquid Chrome (12px). Preserve the existing pill switches and badges where their component rules specify them.

## Components

Primary administrator actions use `--control-gradient` with `--on-action`; neutral controls use `--control-raised` or `--control-surface` with `--control-foreground`. Keep this pairing: dark text on a silver primary action and pearl text on a dark neutral control serve different surfaces.

Inputs use `--input-bg`, `--ink` and semantic borders. Chrome fields remain recessed and legible. Focus uses an explicit outline; error and success states retain text as well as color. Disabled actions retain their existing unavailable state.

Navigation retains active/selected roles and current-page semantics. Status badges distinguish editing from read-only state. Cards and records retain existing dimensions, content and responsive behavior. The canonical preview is `/admin/components`; it includes buttons, switch, inputs, textarea, links, status badges and notices.

The sidecar contains seven self-contained examples derived from actual controls: primary and neutral action, input, vault navigation, status badge, administrator record and notice. They inherit live CSS variables. They document primitives, not every theme-specific preview override or the GPU scene.

## Do's and Don'ts

### Do:

- Do preserve Obsidianite as the default and retain all existing theme choices.
- Do use the single registry and semantic roles across public and administrator pages.
- Do keep reading, editor and chat content legible under every theme.
- Do preserve focus, disabled, error and success states.
- Do keep Liquid Chrome optional and preserve the administrator's theme-availability settings.

### Don't:

- Don't change layouts or application functions to introduce a theme.
- Don't replace Liquid Glass with Liquid Chrome.
- Don't recolor uploaded images, remote pixels or drawing objects.
- Don't place animated glare over text or intercept input with decorative rendering.
- Don't claim measured GPU performance from configured renderer limits.
