/* Original rounded outline icons. Names correspond to actual platform sections. */
const UI_ICON_PATHS = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  cattle: '<path d="M7 8 4 4 3 8l3 3m11-3 3-4 1 4-3 3M7 9c2-2 8-2 10 0l1 8c0 3-12 3-12 0l1-8Z"/><path d="M8 15h8M9 12h.01M15 12h.01M9 17h.01M15 17h.01"/>',
  sheep: '<path d="M8 7a3 3 0 0 1 5-2 3 3 0 0 1 5 3 4 4 0 0 1 1 7 4 4 0 0 1-6 3 4 4 0 0 1-6 0M8 9 4 8l-1 4 3 3h3l1-5-2-1ZM8 18v3m9-3v3"/>',
  sprout: '<path d="M12 21V11m0 5C4 17 3 12 3 7c6-1 10 2 9 9Zm0-5c0-6 4-9 9-8 0 5-3 9-9 8Z"/>',
  scan: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M2 12h20"/><path d="M8 8h8M8 16h8" opacity=".5"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7-1v4m-2-2h4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  wheat: '<path d="M5 21 19 7M8 18c-5 0-5-3-5-5 3 0 5 2 5 5Zm4-4c-5 0-5-3-5-5 3 0 5 2 5 5Zm4-4c-4 0-5-3-5-5 3 0 5 2 5 5Zm-7 9c0-5 3-5 5-5 0 3-2 5-5 5Zm4-4c0-5 3-5 5-5 0 3-2 5-5 5Zm4-4c0-5 3-5 5-5 0 3-2 5-5 5ZM18 7V3"/>',
  passport: '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="9" r="2"/><path d="M8 16c0-4 8-4 8 0M9 19h6"/>',
  scale: '<path d="M12 3v18M5 7l14-2M5 7 2 14h6L5 7Zm14-2-3 9h6l-3-9ZM8 21h8"/>',
  bowl: '<path d="M3 12h18a9 9 0 0 1-18 0ZM8 21h8M8 8V5m4 3V3m4 5V5"/>',
  health: '<path d="M20 4c-3-2-6 0-8 2-2-2-5-4-8-2-5 4 0 10 8 17 8-7 13-13 8-17Z"/><path d="M3 12h5l2-4 4 8 2-4h5"/>',
  vaccine: '<path d="m15 3 6 6M17 5l-3 3m5-1-3 3M5 14l5 5 8-8-5-5-8 8Zm2 3-4 4m5-10 3 3m0-6 3 3"/>',
  farm: '<path d="m3 10 9-7 9 7v11H3V10Zm5 11V11h8v10m-8-9 8 9m0-9-8 9M9 7h6"/>',
  chart: '<path d="M3 3v18h18M7 16v-4m5 4V7m5 9V9"/>',
  market: '<path d="M3 9h18l-2-6H5L3 9Zm1 0v12h16V9M3 9c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0M9 21v-6h6v6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  package: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M8 5l9 5"/>',
  chat: '<path d="M21 11c0 5-4 8-9 8H6l-4 3V11c0-5 4-8 10-8s9 3 9 8Z"/><path d="M7 10h10M7 14h6"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2c0-8 16-8 16 0v2"/>',
  shield: '<path d="M12 2 3 6v6c0 5 6 9 9 10 3-1 9-5 9-10V6l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
  logout: '<path d="M9 3H4v18h5m6-14 5 5-5 5M8 12h12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  arrow: '<path d="M5 19 19 5M5 5h14v14"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h.01m4 0h.01m4 0h.01"/>'
};
function uiIcon(name, size = 20) {
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${UI_ICON_PATHS[name] || UI_ICON_PATHS.overview}</svg>`;
}
const ROUTE_ICONS = { app:'overview',animals:'cattle',scan:'scan','agro-scan':'sprout',assistant:'sparkles',reminders:'bell','feed-market':'wheat',passport:'passport',weight:'scale',feeding:'bowl',health:'health',vacc:'vaccine',farm:'farm',reports:'chart',market:'market',sellers:'search','market-my':'package','market-chats':'chat',pricing2:'card',profile:'user',admin:'shield',add:'plus' };
function routeIcon(route, size = 20) { return uiIcon(ROUTE_ICONS[route.replace('#/', '')], size); }
