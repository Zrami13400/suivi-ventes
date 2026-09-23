/**
 * Plus de réglage spécial pour les « Cannot find module './XXX.js' » /
 * « Loading chunk failed » en dev sous Windows : depuis Next 16,
 * - `next dev` écrit dans .next/dev, séparé de `next build` (.next), donc un
 *   build lancé pendant le dev n'écrase plus ses chunks ;
 * - le dev tourne sous Turbopack, qui remplace le cache webpack (.pack) que
 *   l'antivirus verrouillait et laissait à moitié écrit.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
