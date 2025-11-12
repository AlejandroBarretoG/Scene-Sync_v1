
import { Subtitle } from '../types';

const timeStringToSeconds = (time: string): number => {
  const parts = time.split(/[:,]/);
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);
  const milliseconds = parseInt(parts[3], 10);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
};

export const parseSrt = (srtContent: string): Subtitle[] => {
  const subtitles: Subtitle[] = [];
  const blocks = srtContent.trim().split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    if (lines.length >= 3) {
      const id = parseInt(lines[0], 10);
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      
      if (id && timeMatch) {
        const startTime = timeStringToSeconds(timeMatch[1]);
        const endTime = timeStringToSeconds(timeMatch[2]);
        const text = lines.slice(2).join('\n');
        
        subtitles.push({ id, startTime, endTime, text });
      }
    }
  }

  return subtitles;
};

export const formatTimestamp = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000).toString().padStart(3, '0');
    
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
};
