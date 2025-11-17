import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  XMarkIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  Squares2X2Icon,
  ListBulletIcon,
  MapPinIcon,
  ClockIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const PhotoGallery = ({ jobId, photos = [], onDeletePhoto, onUploadPhoto, isLoading = false, readOnly = false, companyId, uploadedBy }) => {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const sortedPhotos = useMemo(() => {
    if (!Array.isArray(photos)) return [];
    return [...photos].sort((a, b) => {
      const timeA = new Date(a.capturedAt || a.uploadedAt || 0).getTime();
      const timeB = new Date(b.capturedAt || b.uploadedAt || 0).getTime();
      return timeB - timeA; // Newest first
    });
  }, [photos]);

  const currentPhoto = selectedPhotoIndex !== null ? sortedPhotos[selectedPhotoIndex] : null;

  const handlePreviousPhoto = () => {
    setSelectedPhotoIndex((prev) =>
      prev === 0 ? sortedPhotos.length - 1 : prev - 1
    );
  };

  const handleNextPhoto = () => {
    setSelectedPhotoIndex((prev) =>
      prev === sortedPhotos.length - 1 ? 0 : prev + 1
    );
  };

  const handleDownloadPhoto = async (photo) => {
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = photo.fileName || `photo-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Photo downloaded successfully');
    } catch (error) {
      console.error('Error downloading photo:', error);
      toast.error('Failed to download photo');
    }
  };

  const handleDeletePhoto = async (photo) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) {
      return;
    }

    try {
      if (onDeletePhoto) {
        await onDeletePhoto(photo.id);
        setIsLightboxOpen(false);
        toast.success('Photo deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast.error('Failed to delete photo');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    if (!jobId || !companyId || !uploadedBy) {
      toast.error('Missing required information for photo upload');
      return;
    }

    setIsUploading(true);
    try {
      if (onUploadPhoto) {
        for (const file of files) {
          await onUploadPhoto(file);
        }
        toast.success(`Successfully uploaded ${files.length} photo${files.length > 1 ? 's' : ''}`);
      } else {
        toast.error('Upload handler not provided');
      }
    } catch (error) {
      console.error('Error uploading photos:', error);
      toast.error('Failed to upload photos');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!sortedPhotos.length) {
    return (
      <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
        <div className="text-gray-400 mb-2 text-4xl">📸</div>
        <p className="text-gray-600">No photos uploaded yet</p>
        {!readOnly && onUploadPhoto ? (
          <>
            <p className="text-sm text-gray-500 mt-1 mb-4">Upload photos to document this job</p>
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PhotoIcon className="w-5 h-5" />
              <span>{isUploading ? 'Uploading...' : 'Upload Photos'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </>
        ) : (
          <p className="text-sm text-gray-500 mt-1">Upload photos from the mobile app to see them here</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Photos ({sortedPhotos.length})</h3>
          <p className="text-sm text-gray-500 mt-1">Job documentation and progress photos</p>
        </div>
        <div className="flex gap-2">
          {!readOnly && onUploadPhoto && (
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Upload photos"
            >
              <PhotoIcon className="w-5 h-5" />
              <span className="text-sm font-medium">{isUploading ? 'Uploading...' : 'Upload'}</span>
            </button>
          )}
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'grid'
                ? 'bg-primary-100 text-primary-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="Grid view"
          >
            <Squares2X2Icon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'list'
                ? 'bg-primary-100 text-primary-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="List view"
          >
            <ListBulletIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      {!readOnly && onUploadPhoto && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {sortedPhotos.map((photo, index) => (
            <button
              key={photo.id || index}
              onClick={() => {
                setSelectedPhotoIndex(index);
                setIsLightboxOpen(true);
              }}
              className="relative group overflow-hidden rounded-lg bg-gray-200 aspect-square hover:shadow-lg transition-shadow"
            >
              <img
                src={photo.url}
                alt={`Photo ${index + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white">
                  <div className="text-sm font-medium">View</div>
                </div>
              </div>
              {photo.capturedAt && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-xs">{formatDate(photo.capturedAt)}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2 border rounded-lg divide-y">
          {sortedPhotos.map((photo, index) => (
            <button
              key={photo.id || index}
              onClick={() => {
                setSelectedPhotoIndex(index);
                setIsLightboxOpen(true);
              }}
              className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
            >
              <img
                src={photo.thumbnailUrl || photo.url}
                alt={`Photo ${index + 1}`}
                className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                onError={(e) => {
                  // Fallback to full image if thumbnail fails to load
                  if (e.target.src !== photo.url) {
                    e.target.src = photo.url;
                  }
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <ClockIcon className="w-4 h-4" />
                  <span>{formatDate(photo.capturedAt || photo.uploadedAt)}</span>
                </div>
                {photo.notes && (
                  <p className="text-sm text-gray-700 truncate">{photo.notes}</p>
                )}
                {photo.latitude && photo.longitude && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <MapPinIcon className="w-3 h-3" />
                    <span>{photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}</span>
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 text-gray-400">→</div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {isLightboxOpen && currentPhoto && (
        <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center p-4">
          {/* Close button */}
          <button
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
          >
            <XMarkIcon className="w-8 h-8" />
          </button>

          {/* Navigation info */}
          <div className="absolute top-4 left-4 text-white text-sm">
            {selectedPhotoIndex + 1} of {sortedPhotos.length}
          </div>

          {/* Image container */}
          <div className="relative w-full max-w-4xl max-h-[80vh] flex items-center justify-center">
            <img
              src={currentPhoto.url}
              alt="Full size photo"
              className="max-w-full max-h-full object-contain"
            />

            {/* Navigation arrows */}
            {sortedPhotos.length > 1 && (
              <>
                <button
                  onClick={handlePreviousPhoto}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-20 hover:bg-opacity-40 text-white p-2 rounded-lg transition-all"
                >
                  <ArrowLeftIcon className="w-6 h-6" />
                </button>
                <button
                  onClick={handleNextPhoto}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-20 hover:bg-opacity-40 text-white p-2 rounded-lg transition-all"
                >
                  <ArrowRightIcon className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* Metadata and actions */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6 text-white">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  {currentPhoto.capturedAt && (
                    <p className="text-sm text-gray-300 mb-2">
                      📅 {formatDate(currentPhoto.capturedAt)}
                    </p>
                  )}
                  {currentPhoto.notes && (
                    <p className="text-sm mb-2">{currentPhoto.notes}</p>
                  )}
                  {currentPhoto.latitude && currentPhoto.longitude && (
                    <p className="text-sm text-gray-300">
                      📍 {currentPhoto.latitude.toFixed(6)}, {currentPhoto.longitude.toFixed(6)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleDownloadPhoto(currentPhoto)}
                    className="p-2 bg-white bg-opacity-20 hover:bg-opacity-40 rounded-lg transition-all"
                    title="Download"
                  >
                    <ArrowDownTrayIcon className="w-5 h-5" />
                  </button>
                  {!readOnly && onDeletePhoto && (
                    <button
                      onClick={() => handleDeletePhoto(currentPhoto)}
                      className="p-2 bg-red-500 bg-opacity-20 hover:bg-opacity-40 rounded-lg transition-all text-red-200"
                      title="Delete"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoGallery;

