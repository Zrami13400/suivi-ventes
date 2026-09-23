import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/**
 * Correctif durable des « Cannot find module './XXX.js' » / « Loading chunk
 * failed » en dev sous Windows :
 *
 * 1. Dossier de sortie séparé pour `next dev` (.next-dev) : un `next build`
 *    lancé pendant que le serveur de dev tourne n'écrase plus ses chunks
 *    (cause n°1 des modules introuvables qui imposaient Ctrl+Maj+R).
 * 2. Cache webpack en mémoire en dev : plus de fichiers .pack sur disque,
 *    que l'antivirus (Defender) verrouille pendant leur renommage et laisse
 *    à moitié écrits — ce qui corrompait le cache d'une session à l'autre.
 */
export default function nextConfig(phase) {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  /** @type {import('next').NextConfig} */
  const config = {
    distDir: isDev ? ".next-dev" : ".next",
  };

  if (isDev) {
    config.webpack = (webpackConfig, { dev }) => {
      if (dev) webpackConfig.cache = { type: "memory" };
      return webpackConfig;
    };
  }

  return config;
}
