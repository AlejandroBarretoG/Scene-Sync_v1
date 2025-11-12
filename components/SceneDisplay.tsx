import React from 'react';
import { Scene } from '../types';
import { formatTimestamp } from '../services/subtitleParser';
import { PlayIcon, PauseIcon, TrashIcon, SetStartIcon, SetEndIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon, UnlockIcon, BotIcon, MagicWandIcon } from './icons';

interface SceneDisplayProps {
  scenes: Scene[];
  onDeleteScene: (id: number) => void;
  onPlayPauseScene: (scene: Scene) => void;
  onSetSceneStartTime: (id: number) => void;
  onSetSceneEndTime: (id: number) => void;
  isPlayingSceneId: number | null;
  updatedTimestampInfo: { sceneId: number; type: 'start' | 'end' } | null;
  expandedSceneIds: Set<number>;
  onToggleExpansion: (id: number) => void;
  capturingSceneId: number | null;
  onAdjustFrame: (sceneId: number, frameType: 'start' | 'end', direction: 'forward' | 'backward') => void;
  isAdjustingFrame: boolean;
  onToggleSceneLock: (id: number) => void;
  onAnalyzeScene: (id: number) => void;
  analyzingSceneId: number | null;
  onCleanFrame: (sceneId: number, frameType: 'start' | 'end') => void;
  cleaningFrameInfo: { sceneId: number; type: 'start' | 'end' } | null;
}

const SceneDisplay: React.FC<SceneDisplayProps> = ({ 
    scenes, 
    onDeleteScene, 
    onPlayPauseScene, 
    isPlayingSceneId, 
    onSetSceneStartTime, 
    onSetSceneEndTime,
    updatedTimestampInfo,
    expandedSceneIds,
    onToggleExpansion,
    capturingSceneId,
    onAdjustFrame,
    isAdjustingFrame,
    onToggleSceneLock,
    onAnalyzeScene,
    analyzingSceneId,
    onCleanFrame,
    cleaningFrameInfo,
}) => {
  if (scenes.length === 0) {
    return null;
  }

  const IconButton: React.FC<{
    onClick: (e: React.MouseEvent) => void;
    children: React.ReactNode;
    className?: string;
    ariaLabel: string;
    disabled?: boolean;
  }> = ({ onClick, children, className = '', ariaLabel, disabled = false }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`p-1.5 rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );

  const Timestamp: React.FC<{
    time: number;
    isUpdated: boolean;
    isManuallySet: boolean;
  }> = ({ time, isUpdated, isManuallySet }) => (
    <span className={`flex items-center gap-1 font-mono text-xs transition-colors duration-300 ${isUpdated ? 'text-green-400' : isManuallySet ? 'text-yellow-400' : 'text-gray-400'}`}>
      {formatTimestamp(time)}
      {isUpdated && <CheckIcon className="w-3 h-3" />}
    </span>
  );

  const ExpandedDetails: React.FC<{ scene: Scene, sceneIndex: number }> = ({ scene, sceneIndex }) => {
    const isCapturing = capturingSceneId === scene.id;
    const isAnalyzing = analyzingSceneId === scene.id;

    if (isCapturing) {
        return (
            <div className="flex items-center justify-center p-4 bg-gray-900/50 mt-2 rounded-b-lg">
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                <span className="text-sm text-gray-400">Capturing frames...</span>
            </div>
        )
    }

    if (!scene.startFrameThumbnail) return null;

    const duration = scene.endTime - scene.startTime;
    
    const FrameAdjuster: React.FC<{
      thumbnail: string | undefined;
      alt: string;
      onAdjust: (direction: 'forward' | 'backward') => void;
      disabled?: boolean
    }> = ({ thumbnail, alt, onAdjust, disabled = false }) => (
        <div className="relative group">
            <img src={thumbnail} alt={alt} className="w-full object-contain rounded-md bg-black" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex justify-between items-center px-2">
                <IconButton 
                    onClick={() => onAdjust('backward')} 
                    ariaLabel="Adjust one frame back" 
                    className="text-white bg-black/50 hover:bg-black/80"
                    disabled={isAdjustingFrame || disabled}
                >
                    <ChevronLeftIcon className="w-5 h-5" />
                </IconButton>
                <IconButton 
                    onClick={() => onAdjust('forward')} 
                    ariaLabel="Adjust one frame forward" 
                    className="text-white bg-black/50 hover:bg-black/80"
                    disabled={isAdjustingFrame || disabled}
                >
                    <ChevronRightIcon className="w-5 h-5" />
                </IconButton>
            </div>
        </div>
    );

    const FrameSection: React.FC<{
        title: string;
        frameType: 'start' | 'end';
        thumbnail: string | undefined;
        cleanedThumbnail: string | undefined;
        onAdjust: (dir: 'forward' | 'backward') => void;
        adjustDisabled: boolean;
    }> = ({ title, frameType, thumbnail, cleanedThumbnail, onAdjust, adjustDisabled }) => {
        const isCleaning = cleaningFrameInfo?.sceneId === scene.id && cleaningFrameInfo?.type === frameType;
        return (
            <div className="w-1/2 space-y-2">
                <div className="flex justify-between items-center text-xs text-gray-400 px-1">
                    <span>{title}</span>
                    <div className="flex items-center gap-1">
                        {frameType === 'start' && (
                            <button
                                onClick={() => onAnalyzeScene(scene.id)}
                                disabled={!!scene.analysis || isAnalyzing || analyzingSceneId !== null || cleaningFrameInfo !== null}
                                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-600/50 text-indigo-300 hover:bg-indigo-600/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                aria-label="Analyze frame"
                            >
                                {isAnalyzing ? <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : <BotIcon className="w-3 h-3" />}
                                <span>Analyze</span>
                            </button>
                        )}
                        <button
                            onClick={() => onCleanFrame(scene.id, frameType)}
                            disabled={!!cleanedThumbnail || isCleaning || cleaningFrameInfo !== null || analyzingSceneId !== null}
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-teal-600/50 text-teal-300 hover:bg-teal-600/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            aria-label="Clean background"
                        >
                            {isCleaning ? <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : <MagicWandIcon className="w-3 h-3" />}
                            <span>Clean</span>
                        </button>
                    </div>
                </div>
                <FrameAdjuster thumbnail={thumbnail} alt={`${title} frame`} onAdjust={onAdjust} disabled={adjustDisabled} />
                {isCleaning && (
                    <div className="flex items-center justify-center p-2 bg-gray-800/70 rounded-md">
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                        <span className="text-sm text-gray-400">Cleaning background...</span>
                    </div>
                )}
                {cleanedThumbnail && (
                    <div>
                        <img src={cleanedThumbnail} alt={`Cleaned ${title} frame`} className="w-full object-contain rounded-md bg-black mt-2" />
                    </div>
                )}
            </div>
        );
    };


    return (
        <div className="p-3 bg-gray-900/50 mt-2 rounded-b-lg space-y-3">
            <div className="text-center text-xs font-semibold text-gray-300">
                Duration: <span className="font-mono text-cyan-400">{duration.toFixed(2)}s</span>
            </div>
            <div className="flex justify-between items-start gap-2">
                <FrameSection
                    title="Start Frame"
                    frameType="start"
                    thumbnail={scene.startFrameThumbnail}
                    cleanedThumbnail={scene.cleanedStartFrameThumbnail}
                    onAdjust={(dir) => onAdjustFrame(scene.id, 'start', dir)}
                    adjustDisabled={scene.isLocked || sceneIndex === 0}
                />
                 <FrameSection
                    title="End Frame"
                    frameType="end"
                    thumbnail={scene.endFrameThumbnail}
                    cleanedThumbnail={scene.cleanedEndFrameThumbnail}
                    onAdjust={(dir) => onAdjustFrame(scene.id, 'end', dir)}
                    adjustDisabled={scene.isLocked || sceneIndex === scenes.length - 1}
                />
            </div>
            {(isAnalyzing || scene.analysis) && (
                <div className="mt-2 p-3 bg-gray-800/70 rounded-md">
                    <h4 className="text-sm font-semibold text-gray-300 mb-1">Cinematographic Analysis</h4>
                    {isAnalyzing ? (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                             <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                             <span>Generating description...</span>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 whitespace-pre-wrap font-mono">{scene.analysis}</p>
                    )}
                </div>
            )}
        </div>
    )
  }


  return (
    <div className={`max-h-[32rem] overflow-y-auto pr-2 bg-gray-900/50 rounded-lg p-2`}>
      <ul className="space-y-2">
        {scenes.map((scene, index) => {
          const isStartUpdated = updatedTimestampInfo?.sceneId === scene.id && updatedTimestampInfo?.type === 'start';
          const isEndUpdated = updatedTimestampInfo?.sceneId === scene.id && updatedTimestampInfo?.type === 'end';
          const isExpanded = expandedSceneIds.has(scene.id);
          const isCapturing = capturingSceneId !== null;
          const isDisabled = isCapturing || isAdjustingFrame || analyzingSceneId !== null || cleaningFrameInfo !== null;

          return (
            <li
              key={scene.id}
              className={`rounded-lg transition-all duration-300 ${
                  scene.isLocked
                  ? 'ring-2 ring-blue-500 bg-gray-700/50'
                  : isPlayingSceneId === scene.id 
                  ? 'bg-cyan-900/50 ring-2 ring-cyan-500' 
                  : 'bg-gray-800/60 hover:bg-gray-700/80'
              }`}
            >
              <div 
                className={`flex items-center space-x-3 p-2 cursor-pointer ${ isExpanded ? 'rounded-t-lg' : 'rounded-lg' }`}
                onClick={() => onPlayPauseScene(scene)}
              >
                <img src={scene.thumbnailUrl} alt={`Scene ${scene.id} thumbnail`} className="w-24 h-14 object-cover rounded-md bg-black flex-shrink-0" />
                
                <div className="flex-grow flex flex-col justify-center min-w-0">
                  <span className="font-semibold text-gray-200 text-sm truncate">Scene {scene.id}</span>
                  <div className="flex items-center gap-1.5">
                    <Timestamp time={scene.startTime} isUpdated={isStartUpdated} isManuallySet={!!scene.isStartManuallySet} />
                    <span className="text-gray-500">&rarr;</span>
                    <Timestamp time={scene.endTime} isUpdated={isEndUpdated} isManuallySet={!!scene.isEndManuallySet} />
                  </div>
                </div>

                <div className="flex items-center space-x-0.5 bg-gray-900/50 rounded-full">
                   <IconButton
                    onClick={() => onSetSceneStartTime(scene.id)}
                    ariaLabel="Set scene start from playhead"
                    className="text-gray-300 hover:text-white hover:bg-gray-700"
                    disabled={index === 0 || isDisabled || scene.isLocked}
                  >
                    <SetStartIcon className="w-5 h-5" />
                  </IconButton>
                   <IconButton
                    onClick={() => onSetSceneEndTime(scene.id)}
                    ariaLabel="Set scene end from playhead"
                    className="text-gray-300 hover:text-white hover:bg-gray-700"
                    disabled={index === scenes.length - 1 || isDisabled || scene.isLocked}
                  >
                    <SetEndIcon className="w-5 h-5" />
                  </IconButton>
                  <IconButton
                    onClick={() => onToggleSceneLock(scene.id)}
                    ariaLabel={scene.isLocked ? 'Unlock scene' : 'Lock scene'}
                    className={scene.isLocked ? "text-blue-400 hover:bg-blue-400/20" : "text-gray-300 hover:text-white hover:bg-gray-700"}
                    disabled={isDisabled}
                  >
                    {scene.isLocked ? <UnlockIcon className="w-5 h-5" /> : <LockIcon className="w-5 h-5" />}
                  </IconButton>
                  <div className="border-l border-gray-700 h-5 mx-1"></div>
                  <IconButton
                    onClick={() => onPlayPauseScene(scene)}
                    ariaLabel={isPlayingSceneId === scene.id ? 'Pause scene' : 'Play scene'}
                    className="text-cyan-400 hover:bg-cyan-400/20"
                    disabled={isDisabled}
                  >
                    {isPlayingSceneId === scene.id ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                  </IconButton>
                  <IconButton
                    onClick={() => onDeleteScene(scene.id)}
                    ariaLabel="Delete scene"
                    className="text-red-500 hover:bg-red-500/20"
                    disabled={isDisabled || scene.isLocked}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </IconButton>
                   <div className="border-l border-gray-700 h-5 mx-1"></div>
                  <IconButton
                    onClick={() => onToggleExpansion(scene.id)}
                    ariaLabel={isExpanded ? 'Collapse scene details' : 'Expand scene details'}
                    className="text-gray-300 hover:text-white hover:bg-gray-700"
                    disabled={isDisabled && capturingSceneId !== scene.id}
                  >
                    {isExpanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                  </IconButton>
                </div>
              </div>
              {isExpanded && <ExpandedDetails scene={scene} sceneIndex={index} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SceneDisplay;