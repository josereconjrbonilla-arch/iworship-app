// SVG path fragments for the app's inline icon set (ported from the prototype).
export const ICONS = {
    sun:'<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    moon:'<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.8 6.8 0 0 0 20 14.5Z"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    chevron:'<path d="M9 6l6 6-6 6"/>',
    back:'<path d="M15 6l-6 6 6 6"/>',
    book:'<path d="M4 5c4-2 8-1 8 1v13c0-2-4-3-8-1V5Z"/><path d="M20 5c-4-2-8-1-8 1v13c0-2 4-3 8-1V5Z"/>',
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    flag:'<path d="M12 2v20M12 4c3 0 3 2 6 2v6c-3 0-3-2-6-2"/>',
    heart:'<path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.4 1.1 4.1 2.2C10.2 6.1 11.6 5 13.6 5 17 5 18.6 8.4 17 11.7 15.5 16.4 12 21 12 21Z"/>',
    play:'<path d="M8 5l11 7-11 7V5Z"/>',
    tag:'<path d="M12 2 21 11 12 20 3 11V4a2 2 0 0 1 2-2h7Z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    expand:'<path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4"/>',
    compress:'<path d="M9 3v4a1 1 0 0 1-1 1H4M15 3v4a1 1 0 0 0 1 1h4M9 21v-4a1 1 0 0 0-1-1H4M15 21v-4a1 1 0 0 1 1-1h4"/>',
    // Presenter-toolbar reorganization [2026-09-04]: monitor for "open on a
    // second screen" (PROJECTOR VIEW), chat for the collapsible chat toggle.
    monitor:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    chat:'<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
    // Co-hosting [2026-09-05]: for the presenter toolbar's HOSTS button --
    // two overlapping people, the usual "manage other accounts" glyph.
    users:'<circle cx="8.5" cy="8" r="3"/><path d="M2.5 20c0-3.6 2.7-6.5 6-6.5s6 2.9 6 6.5"/><circle cx="17" cy="8.5" r="2.4"/><path d="M15 13.8c2.4.5 4.2 2.9 4.2 6.2"/>',
    // Preview/Go Live [2026-09-06]: a plain lightning bolt for the GO LIVE
    // button -- the standard "broadcast/publish it now" glyph.
    bolt:'<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
    // Media/AVP [2026-09-06]: one icon per media type on the new MEDIA tab
    // and Media Library screen, plus a few small transport/utility glyphs
    // for video playback and the upload flow.
    image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16 15 10l-9 9"/>',
    video:'<rect x="2.5" y="5.5" width="13" height="13" rx="2"/><path d="M15.5 10.5 21 7v10l-5.5-3.5Z"/>',
    layers:'<path d="M12 3 21 8l-9 5-9-5 9-5Z"/><path d="M3 13l9 5 9-5"/><path d="M3 18l9 5 9-5"/>',
    link:'<path d="M9 15 15 9"/><path d="M11 7l1-1a4 4 0 0 1 5.7 5.7l-1 1"/><path d="M13 17l-1 1a4 4 0 0 1-5.7-5.7l1-1"/>',
    upload:'<path d="M12 20V6"/><path d="M6 11l6-6 6 6"/><path d="M4 20h16"/>',
    pause:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    restart:'<path d="M4 12a8 8 0 1 1 3 6.2"/><path d="M4 20v-6h6"/>',
    volumeMute:'<path d="M4 9v6h4l5 5V4L8 9H4Z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    volumeOn:'<path d="M4 9v6h4l5 5V4L8 9H4Z"/><path d="M17.5 8.5a5 5 0 0 1 0 7"/>',
    // Media Folders [2026-09-06]: a plain closed-folder glyph for folder
    // cards on the Media Library screen.
    folder:'<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z"/>',
    // Desktop sidebar nav [2026-09-10]: a few glyphs the sidebar's account
    // menu needed that nothing above already covered (notifications,
    // settings, sign out, explore/compass -- the topbar's own bell button
    // draws its own inline SVG directly in index.html rather than through
    // this shared set, but the sidebar's copy of it reuses this one).
    bell:'<path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/>',
    gear:'<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.6 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    compass:'<circle cx="12" cy="12" r="9.5"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z"/>',
    // Messages [v36]: a distinct "Messenger" glyph (rounded speech bubble +
    // lightning-bolt zigzag) for the new dedicated Messages icon in the
    // topbar/sidebar -- deliberately different from `chat` above, which
    // stays reserved for the in-session host/live chat widget so the two
    // are never visually confused.
    messenger:'<path d="M12 3C6.5 3 2 6.9 2 11.8c0 2.8 1.5 5.3 3.9 6.9V22l3.6-2c.8.2 1.6.3 2.5.3 5.5 0 10-3.9 10-8.8S17.5 3 12 3Z"/><path d="m7 13.5 3.6-3.8 2.7 2 3.6-3.8"/>',
    // Stage overrides [2026-09-24]: a solid filled square for the presenter
    // toolbar's BLACK button -- the one icon in this whole set drawn
    // filled (fill="currentColor" stroke="none" set right on the shape
    // itself) rather than as an outline, on purpose, so it visually reads
    // as "this fills the whole screen with a solid color" at a glance,
    // distinct from every stroke-only glyph around it.
    blackout:'<rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" stroke="none"/>'
  };