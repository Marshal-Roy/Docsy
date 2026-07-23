import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Docsy | Free Online PDF Editor & Creator",
    template: "%s | Docsy PDF Editor",
  },
  description: "Edit PDFs instantly online with Docsy. Our free, professional PDF editor allows you to directly edit text, add images, organize pages, insert comments, and perform OCR without downloading any software.",
  keywords: [
    "pdf editor",
    "edit pdf online",
    "free pdf editor",
    "edit pdf text",
    "pdf creator",
    "modify pdf",
    "online pdf tools",
    "pdf to word",
    "pdf editor free",
    "write on pdf",
    "annotate pdf",
    "pdf document editor"
  ],
  authors: [{ name: "Docsy" }],
  creator: "Docsy",
  publisher: "Docsy",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "Docsy | Free Online PDF Editor",
    description: "Edit PDFs instantly online. Edit text, add images, organize pages, and more directly in your browser. No installation required.",
    url: "https://docsy.com", // Example URL
    siteName: "Docsy",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Docsy | Professional Online PDF Editor",
    description: "Edit PDFs directly in your browser with pixel-perfect precision. Add text, modify fonts, and reorganize pages instantly.",
    creator: "@docsy",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: "https://docsy.com",
  },
};

import Header from "@/components/Header";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="app-container">
          <Header />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
