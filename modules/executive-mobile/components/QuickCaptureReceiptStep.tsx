import React, { useEffect, useRef, useState } from 'react';
import { ICONS } from '../../../constants';
import { ensureCameraForCapture, getCameraPermissionState, type CameraPermissionState } from '../utils/cameraPermission';

type Props = {
  attachment: File | null;
  onAttachmentChange: (file: File | null) => void;
  onError?: (message: string) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function QuickCaptureReceiptStep({ attachment, onAttachmentChange, onError }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraPermissionState>('unknown');
  const [openingCamera, setOpeningCamera] = useState(false);

  useEffect(() => {
    void getCameraPermissionState().then(setCameraState);
  }, []);

  useEffect(() => {
    if (!attachment?.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    onAttachmentChange(file);
  };

  const openCamera = async () => {
    setOpeningCamera(true);
    const result = await ensureCameraForCapture();
    setOpeningCamera(false);
    if (!result.ok) {
      onError?.(result.reason);
      setCameraState(await getCameraPermissionState());
      return;
    }
    setCameraState('granted');
    cameraInputRef.current?.click();
  };

  const openGallery = () => {
    galleryInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-app-muted rounded-lg bg-app-card border border-app-border px-3 py-2">
        Attach a receipt photo or PDF (optional). Finance can review it when posting the transaction.
      </p>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {attachment ? (
        <div className="rounded-xl border border-ds-primary/30 bg-ds-primary/5 p-4 space-y-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Receipt preview"
              className="w-full max-h-48 object-contain rounded-lg bg-app-card"
            />
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-app-card border border-app-border">
              <span className="w-10 h-10 text-ds-primary shrink-0">{ICONS.fileText}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-app-text truncate">{attachment.name}</p>
                <p className="text-xs text-app-muted">{formatFileSize(attachment.size)}</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void openCamera()}
              disabled={openingCamera}
              className="flex-1 py-2.5 rounded-xl border border-app-border text-sm font-semibold touch-manipulation disabled:opacity-60"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={openGallery}
              className="flex-1 py-2.5 rounded-xl border border-app-border text-sm font-semibold touch-manipulation"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onAttachmentChange(null)}
              className="px-4 py-2.5 rounded-xl border border-ds-danger/40 text-ds-danger text-sm font-semibold touch-manipulation"
              aria-label="Remove receipt"
            >
              <span className="w-4 h-4 inline-flex">{ICONS.trash}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => void openCamera()}
            disabled={openingCamera}
            className="qc-receipt-action touch-manipulation disabled:opacity-60"
          >
            <span className="qc-receipt-action-icon text-ds-primary">
              <span className="w-7 h-7">{ICONS.camera}</span>
            </span>
            <span className="text-sm font-bold text-app-text mt-2">Take photo</span>
            <span className="text-[10px] text-app-muted mt-0.5">Scan receipt with camera</span>
          </button>
          <button
            type="button"
            onClick={openGallery}
            className="qc-receipt-action touch-manipulation"
          >
            <span className="qc-receipt-action-icon text-emerald-600 dark:text-emerald-400">
              <span className="w-7 h-7">{ICONS.upload}</span>
            </span>
            <span className="text-sm font-bold text-app-text mt-2">Gallery / files</span>
            <span className="text-[10px] text-app-muted mt-0.5">Photo or PDF from device</span>
          </button>
        </div>
      )}

      {cameraState === 'denied' && !attachment && (
        <p className="text-xs text-amber-700 dark:text-amber-400 text-center px-2">
          Camera blocked — enable it in Settings for PBooks Pro, or use Gallery / files instead.
        </p>
      )}
    </div>
  );
}
