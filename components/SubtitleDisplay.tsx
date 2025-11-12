
import React from 'react';
import { Subtitle } from '../types';
import { formatTimestamp } from '../services/subtitleParser';

interface SubtitleDisplayProps {
  subtitles: Subtitle[];
  videoRef: React.RefObject<HTMLVideoElement>;
}

const SubtitleDisplay: React.FC<SubtitleDisplayProps> = ({ subtitles, videoRef }) => {
  const handleSubtitleClick = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  if (subtitles.length === 0) {
    return <div className="text-center text-gray-500 py-8">No subtitles to display.</div>;
  }

  return (
    <div className="max-h-96 overflow-y-auto pr-2">
      <ul className="space-y-3">
        {subtitles.map((sub) => (
          <li
            key={sub.id}
            onClick={() => handleSubtitleClick(sub.startTime)}
            className="cursor-pointer p-3 bg-gray-900/50 hover:bg-gray-700/70 rounded-lg transition-colors duration-200"
          >
            <div className="flex items-start space-x-4">
              <div className="font-mono text-xs text-cyan-400 mt-1">{formatTimestamp(sub.startTime)}</div>
              <p className="text-sm text-gray-300 flex-1">{sub.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SubtitleDisplay;
