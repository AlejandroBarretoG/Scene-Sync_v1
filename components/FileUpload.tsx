
import React, { useRef, ChangeEvent } from 'react';
import { UploadCloudIcon, FileTextIcon } from './icons';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept: string;
  label: string;
  file: File | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, accept, label, file }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const isVideo = accept.startsWith('video');

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={accept}
        className="hidden"
      />
      <button
        onClick={handleButtonClick}
        className="w-full bg-gray-700/50 hover:bg-gray-700 border-2 border-dashed border-gray-600 hover:border-cyan-500 rounded-lg p-4 text-sm text-gray-400 hover:text-white transition-all duration-300 flex flex-col sm:flex-row items-center justify-center text-center"
      >
        <div className="mb-2 sm:mb-0 sm:mr-4">
          {isVideo ? <UploadCloudIcon className="w-8 h-8"/> : <FileTextIcon className="w-8 h-8"/>}
        </div>
        <div className="flex-grow">
          <p className="font-semibold">{label}</p>
          {file ? (
            <p className="text-xs text-cyan-400 truncate max-w-full">{file.name}</p>
          ) : (
            <p className="text-xs">Click to select a file</p>
          )}
        </div>
      </button>
    </div>
  );
};

export default FileUpload;
