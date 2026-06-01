import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Bebas_Neue, JetBrains_Mono } from 'next/font/google';
import NextTopLoader from 'nextjs-toploader';
import { ThemeProvider } from '../components/theme-provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const bebas = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SteadyState — The Smart Gym Platform for UAE Operators',
  description: 'The intelligence layer for UAE gym operators.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/overview"
      signUpFallbackRedirectUrl="/onboarding"
    >
      <html
        lang="en"
        suppressHydrationWarning
        className={`${inter.variable} ${bebas.variable} ${jetbrains.variable}`}
      >
        <body className="font-sans antialiased">
          <NextTopLoader
            color="#00E87A"
            showSpinner={false}
            height={3}
            shadow="0 0 12px #00E87A, 0 0 4px #00E87A"
          />
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
