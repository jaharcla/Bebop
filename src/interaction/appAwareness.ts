export type AppCategory = "coding" | "writing" | "browser" | "media" | "creative" | "chat" | "presentation" | "other";

const categories: Record<Exclude<AppCategory, "other">, string[]> = {
  coding: ["code", "code - insiders", "cursor", "windsurf", "devenv", "idea64", "pycharm64", "webstorm64", "rider64", "notepad++", "windowsterminal", "wt", "powershell", "pwsh", "cmd"],
  writing: ["winword", "onenote", "notion", "obsidian", "notepad", "soffice", "soffice.bin", "acrobat", "acrord32"],
  browser: ["chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "arc"],
  media: ["spotify", "vlc", "wmplayer", "music.ui", "video.ui", "mpv", "foobar2000"],
  creative: ["figma", "photoshop", "illustrator", "blender", "krita", "inkscape", "aseprite"],
  chat: ["discord", "slack", "teams", "ms-teams", "zoom"],
  presentation: ["powerpnt"]
};

export function classifyApp(processName: string | null): AppCategory {
  const name = processName?.toLowerCase().replace(/\.exe$/, "") ?? "";
  for (const [category, names] of Object.entries(categories)) {
    if (names.includes(name)) return category as AppCategory;
  }
  return "other";
}
