import type { BotId, Mood } from './types';
// Four event tokens fetched from devday.openai.com. Sky remains a local sticker token.
export const CAST = [
  { id: 'bot1', name: 'Plum', color: '#924FF7', stickerColor: '#5B30A6', signature: 'suspicious', personality: 'The skeptic', line: 'Trust, but double-check.' },
  { id: 'bot2', name: 'Lime', color: '#04B84C', stickerColor: '#58A81A', signature: 'found', personality: 'The finder', line: 'There’s always a little more to discover.' },
  { id: 'bot3', name: 'Tango', color: '#FF8549', stickerColor: '#DE5A26', signature: 'bored', personality: 'The patient one', line: 'Good things take a little time.' },
  { id: 'bot4', name: 'Blu', color: '#006AFF', stickerColor: '#2E61C8', signature: 'focused', personality: 'The doer', line: 'Less talking. More doing.' },
  { id: 'bot5', name: 'Sky', color: '#A6D8F5', stickerColor: '#A6D8F5', signature: 'happy', personality: 'The cheerful one', line: 'A little optimism goes a long way.' },
] as const satisfies readonly { id: BotId; name: string; color: string; stickerColor: string; signature: Mood; personality: string; line: string }[];
export const castFor = (id: BotId) => CAST.find(bot => bot.id === id)!;
export const CURSOR_GLIDE_MS = 350;
export const FRAME_FPS = 8;
