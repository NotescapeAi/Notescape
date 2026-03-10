import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import getCroppedImg from "../lib/cropImage";
import Button from "./Button";

interface ImageCropperProps {
  imageSrc: string;
  onCancel: () => void;
  onCropComplete: (croppedBlob: Blob) => void;
}

export default function ImageCropper({
  imageSrc,
  onCancel,
  onCropComplete,
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [loading, setLoading] = useState(false);

  const onCropChange = (crop: { x: number; y: number }) => {
    setCrop(crop);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onCropCompleteHandler = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const saveCrop = async () => {
    if (!croppedAreaPixels) return;
    setLoading(true);
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (croppedBlob) {
        onCropComplete(croppedBlob);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl flex flex-col h-[80vh] max-h-[600px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-main">Adjust Profile Picture</h3>
          <button
            onClick={onCancel}
            className="text-muted hover:text-main transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="relative flex-1 w-full bg-black rounded-lg overflow-hidden mb-4">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={onCropChange}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={onZoomChange}
            showGrid={false}
            cropShape="round"
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted w-8">Zoom</span>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1 bg-token rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveCrop} disabled={loading}>
              {loading ? "Processing..." : "Save & Upload"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
