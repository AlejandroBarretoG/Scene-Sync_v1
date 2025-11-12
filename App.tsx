import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Subtitle, Scene } from './types';
import { parseSrt } from './services/subtitleParser';
import FileUpload from './components/FileUpload';
import VideoPlayer from './components/VideoPlayer';
import SubtitleDisplay from './components/SubtitleDisplay';
import SceneDisplay from './components/SceneDisplay';
import { Wand2Icon, InfoIcon, SaveIcon, FolderOpenIcon } from './components/icons';
import { GoogleGenAI, Modality } from "@google/genai";
import { cinematographyGuideText } from './services/cinematographyGuide';

type Tab = 'original' | 'adapted';

const getFrameSignature = (ctx: CanvasRenderingContext2D, width: number, height: number): { luminance: number, histogram: number[] } => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let totalLuminance = 0;
  const histogram = new Array(16 * 16 * 16).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Luminance
    totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;

    // 4-bit per channel histogram (12-bit color)
    const rBin = r >> 4;
    const gBin = g >> 4;
    const bBin = b >> 4;
    const binIndex = (rBin << 8) + (gBin << 4) + bBin;
    histogram[binIndex]++;
  }

  const pixelCount = width * height;
  // Normalize histogram
  for (let i = 0; i < histogram.length; i++) {
      histogram[i] /= pixelCount;
  }
  
  return { 
    luminance: totalLuminance / pixelCount,
    histogram,
  };
};

const getFrameDiff = (sig1: { luminance: number, histogram: number[] }, sig2: { luminance: number, histogram: number[] }): number => {
    const lumDiff = Math.abs(sig1.luminance - sig2.luminance);
    
    let histDiff = 0;
    for (let i = 0; i < sig1.histogram.length; i++) {
        histDiff += Math.abs(sig1.histogram[i] - sig2.histogram[i]);
    }
    
    // Combine differences. Weight luminance difference more heavily.
    return (lumDiff * 0.7) + (histDiff * 0.3 * 100); // Scale histDiff to be more comparable
};


export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [originalSubtitles, setOriginalSubtitles] = useState<Subtitle[]>([]);
  const [adaptedSubtitles, setAdaptedSubtitles] = useState<Subtitle[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>('original');
  const [detectionThreshold, setDetectionThreshold] = useState(10);
  const [playbackRange, setPlaybackRange] = useState<{ start: number, end: number } | null>(null);
  const [isPlayingSceneId, setIsPlayingSceneId] = useState<number | null>(null);
  const [updatedTimestampInfo, setUpdatedTimestampInfo] = useState<{ sceneId: number; type: 'start' | 'end' } | null>(null);
  const [expandedSceneIds, setExpandedSceneIds] = useState(new Set<number>());
  const [capturingSceneId, setCapturingSceneId] = useState<number | null>(null);
  const [isAdjustingFrame, setIsAdjustingFrame] = useState(false);
  const [analyzingSceneId, setAnalyzingSceneId] = useState<number | null>(null);
  const [cleaningFrameInfo, setCleaningFrameInfo] = useState<{ sceneId: number; type: 'start' | 'end' } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scenePauseRef = useRef(false);
  const loadScenesInputRef = useRef<HTMLInputElement>(null);
  const updateTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackRange) return;

    const checkTime = () => {
      if (video.currentTime >= playbackRange.end) {
        scenePauseRef.current = true;
        video.pause();
        setPlaybackRange(null);
        setIsPlayingSceneId(null);
      }
    };
    
    const handlePause = () => {
      if (scenePauseRef.current) {
        scenePauseRef.current = false;
        return;
      }
      setIsPlayingSceneId(null);
      setPlaybackRange(null);
    }

    video.addEventListener('timeupdate', checkTime);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', checkTime);
      video.removeEventListener('pause', handlePause);
    };
  }, [playbackRange]);

  const handleVideoUpload = (file: File) => {
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    // Reset dependent state
    setAdaptedSubtitles([]);
    setScenes([]);
    setOriginalSubtitles([]);
    setSubtitleFile(null);
    setActiveTab('original');
  };

  const handleSubtitleUpload = (file: File) => {
    setSubtitleFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        const parsed = parseSrt(content);
        setOriginalSubtitles(parsed);
        setAdaptedSubtitles([]);
        setActiveTab('original');
      }
    };
    reader.readAsText(file);
  };
  
  const handlePlayPauseScene = (scene: Scene) => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlayingSceneId === scene.id) {
        video.pause();
        setIsPlayingSceneId(null);
        setPlaybackRange(null);
    } else {
        video.currentTime = scene.startTime;
        setPlaybackRange({ start: scene.startTime, end: scene.endTime });
        setIsPlayingSceneId(scene.id);
        video.play();
    }
  };

  const handleDeleteScene = (sceneIdToDelete: number) => {
    setScenes(prevScenes => {
        const sceneIndex = prevScenes.findIndex(s => s.id === sceneIdToDelete);
        if (sceneIndex === -1) return prevScenes;

        let newScenes = [...prevScenes];
        const sceneToDelete = newScenes[sceneIndex];
        
        if (sceneToDelete.isLocked) return prevScenes;

        if (sceneIndex > 0) {
            newScenes[sceneIndex - 1].endTime = sceneToDelete.endTime;
            // Preserve the manually set status
            newScenes[sceneIndex - 1].isEndManuallySet = sceneToDelete.isEndManuallySet;
        } else if (newScenes.length > 1) {
            newScenes[1].startTime = 0;
            // If the first scene is deleted, the new first scene's start time is not considered manually set
            newScenes[1].isStartManuallySet = false; 
        }
        
        return newScenes.filter(s => s.id !== sceneIdToDelete)
                        .map((s, index) => ({ ...s, id: index + 1 }));
    });
  };

  const handleToggleSceneLock = (sceneId: number) => {
    setScenes(prevScenes =>
      prevScenes.map(s =>
        s.id === sceneId ? { ...s, isLocked: !s.isLocked } : s
      )
    );
  };

  const showUpdateConfirmation = (sceneId: number, type: 'start' | 'end') => {
    if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
    }
    setUpdatedTimestampInfo({ sceneId, type });
    updateTimeoutRef.current = window.setTimeout(() => {
        setUpdatedTimestampInfo(null);
    }, 2000);
  };

  const handleSetSceneStartTime = (sceneId: number) => {
    if (!videoRef.current) return;

    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex <= 0) return;

    const prevScene = scenes[sceneIndex - 1];
    const currentScene = scenes[sceneIndex];

    if (currentScene.isLocked) return;

    const currentTime = videoRef.current.currentTime;

    if (currentTime >= currentScene.endTime) {
      alert("Invalid start time. The new time must be before the current scene's end.");
      return;
    }
    if (prevScene.isLocked && currentTime < prevScene.endTime) {
      alert("Invalid start time. Cannot overlap with a locked scene.");
      return;
    }
    if (!prevScene.isLocked && currentTime <= prevScene.startTime) {
      alert("Invalid start time. The new time must be after the previous scene's start.");
      return;
    }

    setScenes(prevScenes => {
        const newScenes = JSON.parse(JSON.stringify(prevScenes));
        if (!prevScene.isLocked) {
          newScenes[sceneIndex - 1].endTime = currentTime;
          newScenes[sceneIndex - 1].isEndManuallySet = true;
        }
        newScenes[sceneIndex].startTime = currentTime;
        newScenes[sceneIndex].isStartManuallySet = true;
        return newScenes;
    });
    showUpdateConfirmation(sceneId, 'start');
  };

  const handleSetSceneEndTime = (sceneId: number) => {
      if (!videoRef.current) return;

      const sceneIndex = scenes.findIndex(s => s.id === sceneId);
      if (sceneIndex < 0 || sceneIndex === scenes.length - 1) return;

      const currentScene = scenes[sceneIndex];
      const nextScene = scenes[sceneIndex + 1];

      if (currentScene.isLocked) return;

      const currentTime = videoRef.current.currentTime;

      if (currentTime <= currentScene.startTime) {
          alert("Invalid end time. The new time must be after the current scene's start.");
          return;
      }
      if (nextScene.isLocked && currentTime > nextScene.startTime) {
        alert("Invalid end time. Cannot overlap with a locked scene.");
        return;
      }
      if (!nextScene.isLocked && currentTime >= nextScene.endTime) {
          alert("Invalid end time. The new time must be before the next scene's end.");
          return;
      }

      setScenes(prevScenes => {
          const newScenes = JSON.parse(JSON.stringify(prevScenes));
          if (!nextScene.isLocked) {
            newScenes[sceneIndex + 1].startTime = currentTime;
            newScenes[sceneIndex + 1].isStartManuallySet = true;
          }
          newScenes[sceneIndex].endTime = currentTime;
          newScenes[sceneIndex].isEndManuallySet = true;
          return newScenes;
      });
      showUpdateConfirmation(sceneId, 'end');
  };

  const handleSaveScenes = () => {
    if (scenes.length === 0) return;
    const sceneData = JSON.stringify(scenes.map(({thumbnailUrl, startFrameThumbnail, endFrameThumbnail, ...rest}) => rest), null, 2);
    const blob = new Blob([sceneData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${videoFile?.name.split('.')[0] || 'video'}-scenes.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSceneFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const content = event.target?.result as string;
            const loadedScenes = JSON.parse(content);
            if (Array.isArray(loadedScenes) && loadedScenes.every(s => 'id' in s && 'startTime' in s && 'endTime' in s)) {
                // Add a placeholder thumbnail if it doesn't exist in the file
                const scenesWithThumbnails = loadedScenes.map(s => ({...s, thumbnailUrl: s.thumbnailUrl || ''}))
                setScenes(scenesWithThumbnails);
            } else {
                alert('Invalid scene file format.');
            }
        } catch (error) {
            alert('Error parsing scene file.');
            console.error(error);
        }
    };
    reader.readAsText(file);
    if (loadScenesInputRef.current) {
        loadScenesInputRef.current.value = '';
    }
  };

  const seekToAndCapture = useCallback(async (time: number) => {
    return new Promise<string>((resolve, reject) => {
        const video = videoRef.current;
        if (!video) return reject("No video element");

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject("No canvas context");
        
        const originalTime = video.currentTime;
        video.currentTime = time;
        
        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            requestAnimationFrame(() => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                // No need to restore original time here as this is for capture
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            });
        };
        video.addEventListener('seeked', onSeeked);
    });
}, []);

  const handleToggleSceneExpansion = async (sceneId: number) => {
    const newExpandedIds = new Set(expandedSceneIds);
    if (newExpandedIds.has(sceneId)) {
      newExpandedIds.delete(sceneId);
      setExpandedSceneIds(newExpandedIds);
      return;
    }
    
    newExpandedIds.add(sceneId);
    setExpandedSceneIds(newExpandedIds);
    
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene || scene.startFrameThumbnail || !videoRef.current) return;
    
    setCapturingSceneId(sceneId);
    const startFrame = await seekToAndCapture(scene.startTime);

    let endTimeForCapture = scene.endTime;
    if (videoRef.current && scene.endTime >= videoRef.current.duration) {
      // To capture the very last frame, seek to slightly before the end.
      endTimeForCapture = Math.max(0, videoRef.current.duration - 0.1);
    }
    const endFrame = await seekToAndCapture(endTimeForCapture);

    setScenes(prev => prev.map(s => 
        s.id === sceneId 
        ? { ...s, startFrameThumbnail: startFrame, endFrameThumbnail: endFrame } 
        : s
    ));
    setCapturingSceneId(null);
  };

  const handleAdjustFrame = async (sceneId: number, frameType: 'start' | 'end', direction: 'forward' | 'backward') => {
    if (!videoRef.current) return;
    
    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) return;

    const currentScene = scenes[sceneIndex];
    if (currentScene.isLocked) return;

    setIsAdjustingFrame(true);

    const FRAME_RATE = 30; // A reasonable assumption
    const frameDuration = 1 / FRAME_RATE;
    
    const timeAdjustment = direction === 'forward' ? frameDuration : -frameDuration;
    let newTime;

    if (frameType === 'start') {
        const prevScene = sceneIndex > 0 ? scenes[sceneIndex - 1] : null;
        newTime = currentScene.startTime + timeAdjustment;

        if (newTime < 0 || newTime >= currentScene.endTime || (prevScene && !prevScene.isLocked && newTime <= prevScene.startTime) || (prevScene && prevScene.isLocked && newTime < prevScene.endTime)) {
            setIsAdjustingFrame(false);
            return;
        }
        
        const newStartThumbnail = await seekToAndCapture(newTime);
        
        setScenes(prev => prev.map((s, i) => {
            if (i === sceneIndex) return {...s, startTime: newTime, isStartManuallySet: true, startFrameThumbnail: newStartThumbnail};
            if (i === sceneIndex - 1 && !s.isLocked) return {...s, endTime: newTime, isEndManuallySet: true, endFrameThumbnail: newStartThumbnail};
            return s;
        }));

    } else { // 'end'
        const nextScene = sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1] : null;
        newTime = currentScene.endTime + timeAdjustment;

        if (newTime > videoRef.current.duration || newTime <= currentScene.startTime || (nextScene && !nextScene.isLocked && newTime >= nextScene.endTime) || (nextScene && nextScene.isLocked && newTime > nextScene.startTime)) {
            setIsAdjustingFrame(false);
            return;
        }

        let timeForCapture = newTime;
        if (videoRef.current && newTime >= videoRef.current.duration) {
            newTime = videoRef.current.duration; // Clamp the time value itself
            timeForCapture = Math.max(0, newTime - 0.1); // Use a slightly earlier time for the actual capture
        }
        const newEndThumbnail = await seekToAndCapture(timeForCapture);

        setScenes(prev => prev.map((s, i) => {
            if (i === sceneIndex) return {...s, endTime: newTime, isEndManuallySet: true, endFrameThumbnail: newEndThumbnail};
            if (i === sceneIndex + 1 && !s.isLocked) return {...s, startTime: newTime, isStartManuallySet: true, startFrameThumbnail: newEndThumbnail};
            return s;
        }));
    }

    setIsAdjustingFrame(false);
  };

  const handleAnalyzeScene = async (sceneId: number) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene || !scene.startFrameThumbnail) return;

    setAnalyzingSceneId(sceneId);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const imagePart = {
        inlineData: {
          mimeType: 'image/jpeg',
          data: scene.startFrameThumbnail.split(',')[1],
        },
      };
      const textPart = {
        text: `Based on the following cinematography guide, analyze the provided image frame. Describe the shot scale, angle, composition, and lighting using professional terms.\n\n---GUIDE START---\n${cinematographyGuideText}\n---GUIDE END---\n\nAnalysis:`
      };

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
      });

      const analysisText = response.text;

      setScenes(prev => prev.map(s =>
        s.id === sceneId ? { ...s, analysis: analysisText } : s
      ));
    } catch (error) {
      console.error("Error analyzing scene:", error);
      alert("Failed to analyze scene. Please check the console for details.");
    } finally {
      setAnalyzingSceneId(null);
    }
  };

  const handleCleanFrame = async (sceneId: number, frameType: 'start' | 'end') => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const frameToClean = frameType === 'start' ? scene.startFrameThumbnail : scene.endFrameThumbnail;
    if (!frameToClean) return;

    setCleaningFrameInfo({ sceneId, type: frameType });
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      const imagePart = {
        inlineData: {
          mimeType: 'image/jpeg',
          data: frameToClean.split(',')[1],
        },
      };
      const textPart = {
        text: "In this image, identify the main subjects (people, prominent objects) and remove them. Intelligently fill in the background where the subjects were removed, maintaining a natural and coherent appearance. Output only the modified image."
      };
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64ImageBytes = part.inlineData.data;
          const imageUrl = `data:image/png;base64,${base64ImageBytes}`;

          setScenes(prev => prev.map(s => {
            if (s.id === sceneId) {
              if (frameType === 'start') {
                return { ...s, cleanedStartFrameThumbnail: imageUrl };
              } else {
                return { ...s, cleanedEndFrameThumbnail: imageUrl };
              }
            }
            return s;
          }));
          break;
        }
      }
    } catch (error) {
      console.error("Error cleaning frame:", error);
      alert("Failed to clean frame. Please check the console for details.");
    } finally {
      setCleaningFrameInfo(null);
    }
  };

  const handleProcess = useCallback(async () => {
    if (!videoRef.current || !videoRef.current.duration || videoRef.current.duration === Infinity) {
      alert("Please wait for the video metadata to load.");
      return;
    }
    setIsLoading(true);
    setProgress(0);
    setAdaptedSubtitles([]);
    setScenes([]);
    setExpandedSceneIds(new Set());

    const video = videoRef.current;
    
    const canvas = document.createElement('canvas');
    const DOWNSCALE_WIDTH = 128;
    canvas.width = DOWNSCALE_WIDTH;
    canvas.height = DOWNSCALE_WIDTH * (video.videoHeight / video.videoWidth);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      alert("Could not create canvas context for processing.");
      setIsLoading(false);
      return;
    }

    const detectedScenes: Scene[] = [];
    let lastCutTime = 0;
    let previousSignature: { luminance: number, histogram: number[] } | null = null;
    const FPS_TO_CHECK = 2;
    const timeStep = 1 / FPS_TO_CHECK;

    const seekTo = (time: number) => new Promise<void>(resolve => {
        video.currentTime = time;
        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            requestAnimationFrame(() => resolve());
        };
        video.addEventListener('seeked', onSeeked);
    });

    await seekTo(0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let lastThumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);

    for (let time = timeStep; time < video.duration; time += timeStep) {
      await seekTo(time);

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const currentSignature = getFrameSignature(ctx, canvas.width, canvas.height);

      if (previousSignature !== null) {
        const diff = getFrameDiff(currentSignature, previousSignature);
        if (diff > detectionThreshold) {
          detectedScenes.push({
            id: detectedScenes.length + 1,
            startTime: lastCutTime,
            endTime: time,
            thumbnailUrl: lastThumbnailUrl,
          });
          lastCutTime = time;
          lastThumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
        }
      }
      previousSignature = currentSignature;
      setProgress(Math.round((time / video.duration) * 100));
    }

    if (lastCutTime < video.duration) {
      detectedScenes.push({
        id: detectedScenes.length + 1,
        startTime: lastCutTime,
        endTime: video.duration,
        thumbnailUrl: lastThumbnailUrl,
      });
    }

    setScenes(detectedScenes);

    if (originalSubtitles.length > 0) {
      const newAdaptedSubtitles: Subtitle[] = [];
      let subId = 1;
      detectedScenes.forEach(scene => {
        originalSubtitles.forEach(subtitle => {
          const overlapStartTime = Math.max(scene.startTime, subtitle.startTime);
          const overlapEndTime = Math.min(scene.endTime, subtitle.endTime);
          
          if (overlapStartTime < overlapEndTime && (overlapEndTime - overlapStartTime > 0.1)) {
            newAdaptedSubtitles.push({
              id: subId++,
              startTime: overlapStartTime,
              endTime: overlapEndTime,
              text: subtitle.text,
            });
          }
        });
      });

      setAdaptedSubtitles(newAdaptedSubtitles);
      setActiveTab('adapted');
    }

    setIsLoading(false);
    setProgress(0);
  }, [originalSubtitles, detectionThreshold]);

  const canProcess = videoFile && !isLoading;
  const buttonText = subtitleFile ? 'Sync Subtitles to Scenes' : 'Detect Scenes';
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Scene-Sync <span className="text-cyan-400">Subtitles</span>
          </h1>
        </div>
      </header>
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Controls */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
              <h2 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">1. Upload Files</h2>
              <div className="space-y-4">
                <FileUpload onFileSelect={handleVideoUpload} accept="video/*" label="Upload Video" file={videoFile} />
                <FileUpload onFileSelect={handleSubtitleUpload} accept=".srt" label="Upload Subtitles (.srt)" file={subtitleFile} />
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
              <h2 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">2. Process</h2>
               <div className="space-y-3 mb-4">
                  <div className="flex justify-between items-center">
                      <label htmlFor="threshold" className="block text-sm font-medium text-gray-300">
                          Detection Sensitivity
                      </label>
                      <span className="text-sm font-mono bg-gray-900/50 rounded-md px-2 py-1 text-cyan-400">
                          {detectionThreshold}
                      </span>
                  </div>
                  <input
                      id="threshold"
                      type="range"
                      min="1"
                      max="30"
                      step="1"
                      value={detectionThreshold}
                      onChange={(e) => setDetectionThreshold(Number(e.target.value))}
                      disabled={isLoading}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                  />
                  <p className="flex items-center gap-2 text-xs text-gray-500">
                      <InfoIcon className="w-4 h-4 flex-shrink-0"/>
                      <span>Lower values detect more subtle scene changes.</span>
                  </p>
                  <p className="text-xs text-gray-500 pt-2">
                    AI analysis is guided by "Diseño y Direccion Cinematografica.pdf".
                  </p>
                </div>
              <button 
                onClick={handleProcess}
                disabled={!canProcess}
                className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-75"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing... ({progress}%)
                  </>
                ) : (
                  <>
                    <Wand2Icon className="w-5 h-5" />
                    {buttonText}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Player and Subtitles */}
          <div className="lg:col-span-8">
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                <VideoPlayer src={videoUrl} ref={videoRef} />

                {(scenes.length > 0 || originalSubtitles.length > 0) && (
                  <div className="p-4 sm:p-6">
                    {scenes.length > 0 && (
                      <div className="mb-6">
                         <div className="flex justify-between items-center mb-3 border-b border-gray-700 pb-2">
                            <h3 className="text-md font-semibold text-gray-300">Detected Scenes</h3>
                            <div className="flex items-center space-x-2">
                                <button
                                  onClick={handleSaveScenes}
                                  disabled={scenes.length === 0 || isLoading}
                                  aria-label="Save scenes"
                                  className="flex items-center gap-1.5 bg-gray-700/50 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                                >
                                    <SaveIcon className="w-4 h-4" />
                                    <span>Save</span>
                                </button>
                                <button
                                    onClick={() => loadScenesInputRef.current?.click()}
                                    disabled={isLoading}
                                    aria-label="Load scenes"
                                    className="flex items-center gap-1.5 bg-gray-700/50 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                                >
                                    <FolderOpenIcon className="w-4 h-4" />
                                    <span>Load</span>
                                </button>
                                <input type="file" ref={loadScenesInputRef} onChange={handleSceneFileSelected} className="hidden" accept=".json" />
                            </div>
                        </div>
                        <SceneDisplay 
                          scenes={scenes} 
                          onDeleteScene={handleDeleteScene}
                          onPlayPauseScene={handlePlayPauseScene}
                          isPlayingSceneId={isPlayingSceneId}
                          onSetSceneStartTime={handleSetSceneStartTime}
                          onSetSceneEndTime={handleSetSceneEndTime}
                          updatedTimestampInfo={updatedTimestampInfo}
                          expandedSceneIds={expandedSceneIds}
                          onToggleExpansion={handleToggleSceneExpansion}
                          capturingSceneId={capturingSceneId}
                          onAdjustFrame={handleAdjustFrame}
                          isAdjustingFrame={isAdjustingFrame}
                          onToggleSceneLock={handleToggleSceneLock}
                          onAnalyzeScene={handleAnalyzeScene}
                          analyzingSceneId={analyzingSceneId}
                          onCleanFrame={handleCleanFrame}
                          cleaningFrameInfo={cleaningFrameInfo}
                        />
                      </div>
                    )}

                    {originalSubtitles.length > 0 && (
                      <div>
                          <div className="border-b border-gray-700 mb-4">
                              <nav className="flex space-x-4" aria-label="Tabs">
                                  <button onClick={() => setActiveTab('original')} className={`${activeTab === 'original' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors`}>
                                      Original Subtitles
                                  </button>
                                  <button onClick={() => setActiveTab('adapted')} disabled={adaptedSubtitles.length === 0} className={`${activeTab === 'adapted' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} disabled:cursor-not-allowed disabled:text-gray-600 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors`}>
                                      Scene-Adapted Subtitles
                                  </button>
                              </nav>
                          </div>

                          {activeTab === 'original' ? (
                              <SubtitleDisplay subtitles={originalSubtitles} videoRef={videoRef} />
                          ) : (
                              <SubtitleDisplay subtitles={adaptedSubtitles} videoRef={videoRef} />
                          )}
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}