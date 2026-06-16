import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PersonaAI Generator",
  description: "Generador profesional de Buyer Personas sin branding de plataforma.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
