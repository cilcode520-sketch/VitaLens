'use client'
import dynamic from 'next/dynamic'

const NewProfileClient = dynamic(() => import('./_new-profile-client'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
    </div>
  ),
})

export default function NewProfilePage() {
  return <NewProfileClient />
}
