'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export type CameraFacing = 'user' | 'environment'

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>
  stream: MediaStream | null
  isStreaming: boolean
  error: string | null
  facing: CameraFacing
  startCamera: (facing?: CameraFacing) => Promise<void>
  stopCamera: () => void
  flipCamera: () => Promise<void>
  capturePhoto: () => string | null  // returns base64 data URL
  hasMultipleCameras: boolean
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [facing, setFacing] = useState<CameraFacing>('environment')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)

  // Detect if device has multiple cameras
  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput')
        setHasMultipleCameras(videoInputs.length > 1)
      })
      .catch(() => {})
  }, [])

  const startCamera = useCallback(
    async (facingMode: CameraFacing = facing) => {
      // Stop any existing stream first
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
      setError(null)

      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false, // Audio is handled by useSpeechRecognition separately
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          await videoRef.current.play()
        }

        setStream(mediaStream)
        setFacing(facingMode)
        setIsStreaming(true)
      } catch (err) {
        const message =
          err instanceof DOMException
            ? mapCameraError(err.name)
            : '無法啟動相機，請確認設備支援'
        setError(message)
        setIsStreaming(false)
      }
    },
    [stream, facing]
  )

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStream(null)
    setIsStreaming(false)
  }, [stream])

  const flipCamera = useCallback(async () => {
    const newFacing: CameraFacing = facing === 'environment' ? 'user' : 'environment'
    await startCamera(newFacing)
    // Haptic feedback
    if ('vibrate' in navigator) navigator.vibrate(15)
  }, [facing, startCamera])

  /**
   * Capture current video frame as base64 JPEG
   * Returns null if video is not playing
   */
  const capturePhoto = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || !isStreaming) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Mirror for front camera
    if (facing === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

    // Haptic feedback on capture
    if ('vibrate' in navigator) navigator.vibrate([30, 20, 30])

    return dataUrl
  }, [isStreaming, facing])

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  return {
    videoRef,
    stream,
    isStreaming,
    error,
    facing,
    startCamera,
    stopCamera,
    flipCamera,
    capturePhoto,
    hasMultipleCameras,
  }
}

function mapCameraError(name: string): string {
  switch (name) {
    case 'NotAllowedError':
      return '相機權限被拒絕，請在設定中允許使用相機'
    case 'NotFoundError':
      return '找不到相機裝置'
    case 'NotReadableError':
      return '相機被其他應用程式佔用中'
    case 'OverconstrainedError':
      return '裝置不支援所需的相機解析度'
    default:
      return `相機錯誤：${name}`
  }
}
