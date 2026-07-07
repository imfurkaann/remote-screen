import type { ReactNode } from "react";
import "./globals.css";
import { Inter } from "next/font/google";
import { ConfirmProvider } from "@/components/ConfirmProvider";

const inter = Inter({ subsets: ["latin"] });

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </body>
    </html>
  );
}

