'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface UseSpeechRecognitionReturn {
  transcript: string          // Accumulated full transcript
  interimTranscript: string   // Live partial transcript (not yet finalized)
  isListening: boolean
  isSupported: boolean
  error: string | null
  startListening: () => void
  stopListening: () => void
  resetTranscript: () => void
}

// ── Full type declarations for Web Speech API (not in TS lib by default) ──
interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface ISpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null
  start(): void
  stop(): void
  abort(): void
}

// Extend Window type for cross-browser SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition
    webkitSpeechRecognition: new () => ISpeechRecognition
  }
}

export function useSpeechRecognition(
  lang: string = 'zh-TW'
): UseSpeechRecognitionReturn {
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const accumulatedRef = useRef<string>('')   // Persist across results

  // Check browser support
  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const initRecognition = useCallback(() => {
    if (!isSupported) return null

    const SpeechRecognitionAPI: (new () => ISpeechRecognition) | undefined =
      window.SpeechRecognition ?? window.webkitSpeechRecognition

    if (!SpeechRecognitionAPI) return null
    const recognition = new SpeechRecognitionAPI()
    recognition.lang = lang
    recognition.continuous = true        // Keep listening until explicitly stopped
    recognition.interimResults = true    // Show live partial results
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          accumulatedRef.current += result[0].transcript
          setTranscript(accumulatedRef.current)
        } else {
          interim += result[0].transcript
        }
      }
      setInterimTranscript(interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(mapSpeechError(event.error))
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimTranscript('')
    }

    return recognition
  }, [isSupported, lang])

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('此瀏覽器不支援語音辨識，請使用 Chrome 或 Safari')
      return
    }

    // Stop previous instance if any
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }

    const recognition = initRecognition()
    if (!recognition) return

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (err) {
      console.error('SpeechRecognition start error:', err)
      setError('語音辨識啟動失敗，請重試')
    }
  }, [isSupported, initRecognition])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  const resetTranscript = useCallback(() => {
    accumulatedRef.current = ''
    setTranscript('')
    setInterimTranscript('')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  return {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  }
}

function mapSpeechError(error: string): string {
  switch (error) {
    case 'not-allowed':
      return '麥克風權限被拒絕，請在設定中允許使用麥克風'
    case 'no-speech':
      return '未偵測到語音，請靠近麥克風說話'
    case 'audio-capture':
      return '找不到麥克風裝置'
    case 'network':
      return '語音辨識需要網路連線'
    case 'aborted':
      return ''   // User-initiated abort, not an error
    default:
      return `語音辨識錯誤：${error}`
  }
}
