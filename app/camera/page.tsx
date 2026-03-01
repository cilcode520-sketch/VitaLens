'use client'
// 相機頁：完全關閉 SSR，只在瀏覽器端執行
// 原因：需要 navigator.mediaDevices (相機)、SpeechRecognition (語音)、Supabase client
// 這些 API 在 Node.js/build 環境完全不存在

import dynamic from 'next/dynamic'

const CameraClientPage = dynamic(
  () => import('./_camera-client'),
  {
    ssr: false,  // ← 關鍵：完全不在伺服器端渲染
    loading: () => (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        <p className="text-white/60 text-sm">啟動相機中...</p>
      </div>
    ),
  }
)

export default function CameraPage() {
  return <CameraClientPage />
}
