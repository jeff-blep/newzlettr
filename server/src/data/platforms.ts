/** Maps Tautulli platform names to the icons in server/assets/platforms. */
const RULES: [RegExp, string][] = [
  [/^atv$|apple ?tv|tvos/i, "atv.png"],
  [/android ?tv|nvidia|shield|google ?tv/i, "androidtv.png"],
  [/fire ?tv|amazon|aft/i, "firetv.png"],
  [/roku/i, "roku.png"],
  [/chromecast/i, "chromecast.png"],
  [/playstation|ps[345]/i, "playstation.png"],
  [/xbox/i, "xbox.png"],
  [/samsung|tizen/i, "samsung.png"],
  [/^lg$|webos|netcast/i, "lg.png"],
  [/ios|iphone|ipad/i, "ios.png"],
  [/android/i, "android.png"],
  [/mac ?os|osx|macintosh/i, "macos.png"],
  [/windows/i, "windows.png"],
  [/linux/i, "linux.png"],
  [/chrome/i, "chrome.png"],
  [/firefox/i, "firefox.png"],
  [/safari/i, "safari.png"],
  [/edge/i, "edge.png"],
  [/web|plex web/i, "web.png"],
];

export function platformIcon(name: string): string {
  for (const [re, file] of RULES) if (re.test(name)) return file;
  return "generic.png";
}

/** Friendlier names for Tautulli's raw platform strings. */
export function platformLabel(name: string): string {
  const n = name.trim();
  const known: Record<string, string> = {
    tvos: "Apple TV",
    ios: "iPhone / iPad",
    macos: "Mac",
    tizen: "Samsung TV",
    webos: "LG TV",
    "android tv": "Android TV",
    "plex web": "Plex Web",
  };
  return known[n.toLowerCase()] ?? n;
}
