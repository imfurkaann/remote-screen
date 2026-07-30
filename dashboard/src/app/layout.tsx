import type { ReactNode } from "react";
import "./globals.css";
import { ConfirmProvider } from "@/components/ConfirmProvider";

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </body>
    </html>
  );
}

