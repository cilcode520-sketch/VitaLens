import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VitaLens — 家庭精準營養助理',
  description: '用相機與語音，輕鬆記錄家人的每一餐，AI 即時分析營養與安全。',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VitaLens',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#7C3AED',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <head>
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased overscroll-none">
        {children}
      </body>
    </html>
  )
}
