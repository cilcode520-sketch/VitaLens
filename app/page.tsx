'use client'
import dynamic from 'next/dynamic'

const HomeClientPage = dynamic(
  () => import('./_home-client'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">載入 VitaLens...</p>
        </div>
      </div>
    ),
  }
)

export default function HomePage() {
  return <HomeClientPage />
}
