
import React, { forwardRef } from 'react';
import { UploadCloudIcon } from './icons';

interface VideoPlayerProps {
  src: string | null;
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({ src }, ref) => {
  if (!src) {
    return (
      <div className="aspect-video w-full bg-black flex flex-col items-center justify-center text-gray-500">
        <UploadCloudIcon className="w-16 h-16 mb-4"/>
        <p className="text-lg">Upload a video to begin</p>
      </div>
    );
  }

  return (
    <div className="aspect-video w-full bg-black">
      <video ref={ref} src={src} controls className="w-full h-full" />
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
