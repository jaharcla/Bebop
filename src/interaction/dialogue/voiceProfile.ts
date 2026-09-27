export interface VoiceProfile {
  verbosity: number;
  sarcasm: number;
  warmth: number;
  slang: number;
  weirdness: number;
  initiative: number;
  directness: number;
}

export const TINY_MINT_VOICE_PROFILE: VoiceProfile = {
  verbosity: 0.2,
  sarcasm: 0.52,
  warmth: 0.56,
  slang: 0.34,
  weirdness: 0.62,
  initiative: 0.38,
  directness: 0.78
};

export function describeVoiceProfile(profile: VoiceProfile = TINY_MINT_VOICE_PROFILE): string {
  const tags: string[] = [];
  tags.push(profile.verbosity < 0.35 ? "brief" : profile.verbosity > 0.7 ? "talkative" : "moderate");
  if (profile.directness > 0.65) tags.push("direct");
  if (profile.sarcasm > 0.45) tags.push("dry");
  if (profile.warmth > 0.5) tags.push("warm");
  if (profile.weirdness > 0.5) tags.push("weird");
  if (profile.slang > 0.55) tags.push("slangy");
  else if (profile.slang < 0.4) tags.push("light-slang");
  return tags.join(",");
}
