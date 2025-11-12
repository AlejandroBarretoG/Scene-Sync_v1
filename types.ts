export interface Subtitle {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface Scene {
  id: number;
  startTime: number;
  endTime: number;
  thumbnailUrl: string;
  isStartManuallySet?: boolean;
  isEndManuallySet?: boolean;
  startFrameThumbnail?: string;
  endFrameThumbnail?: string;
  isLocked?: boolean;
  analysis?: string;
  cleanedStartFrameThumbnail?: string;
  cleanedEndFrameThumbnail?: string;
}